import { join } from "node:path";
import { DatabaseSync, StatementSync } from "node:sqlite";
import * as logger from "./utilities/logger.ts";
import { toDbId, toHash } from "./utilities/hash.ts";


type SocketCategory = {socketCategoryHash: number; socketIndexes: number[]}
type SocketEntry = {
  randomizedPlugSetHash?: number;
  reusablePlugSetHash?: number;
}

type Perk = {hash: number; name: string; isEnhanced: boolean}
type PerkColumn = {columnIndex: number; perks: Perk[]}

const WEAPON_PERKS_CATEGORY = 4241085061;
const EXCLUDED_PLUG_CATEGORIES = new Set([
  'v400.plugs.weapons.masterworks.trackers',
  'origins',
  'crafting.recipes.empty_socket',
  'catalysts',
  'v400.empty.exotic.masterwork',
  ]);


type ItemDef = {
  hash: number;
  displayProperties: {name: string};
  itemTypeDisplayName?: string;
  inventory?: {tierType: number};
  plug?: {plugCategoryIdentifier: string};
  sockets?: {socketEntries: SocketEntry[]; socketCategories: SocketCategory[]};
}

type PlugSetDef = {
  reusablePlugItems: {plugItemHash: number; currentlyCanRoll?: boolean}[];
}

type Lookup = {
  item: (hash: number) => ItemDef | null;
  plugSet: (hash: number) => PlugSetDef | null;
}

type LookupStats = {
  itemStats: { hits: number; misses: number };
  plugSetStats: { hits: number; misses: number };
}

const createLookup = (manifestDb: DatabaseSync): Lookup & { stats: LookupStats } => {
  const itemStmt = manifestDb.prepare(`
    SELECT json FROM DestinyInventoryItemDefinition WHERE id = ?`
  );
  const plugSetStmt = manifestDb.prepare(`
    SELECT json FROM DestinyPlugSetDefinition WHERE id = ?`
  );

  const itemCache = new Map<number, ItemDef | null>();
  const plugSetCache = new Map<number, PlugSetDef | null>();

  const itemStats = { hits: 0, misses: 0 }; 
  const plugSetStats = { hits: 0, misses: 0 };

  const cached = <T>(stmt: StatementSync, cache: Map<number, T | null>, stats: { hits: number; misses: number }) => (hash: number): T | null => {


    if (cache.has(hash)) {
      stats.hits++;
      return cache.get(hash)!;
    }
    stats.misses++;

    const row = stmt.get(toDbId(hash));
    const rowJson = row ? JSON.parse(row.json as string) : null;
    cache.set(hash, rowJson);
    return rowJson;
  }

  const item = cached<ItemDef>(itemStmt, itemCache, itemStats);
  const plugSet = cached<PlugSetDef>(plugSetStmt, plugSetCache, plugSetStats);

  return { item, plugSet, stats: { itemStats, plugSetStats } };
}

const extractPerkColumns = (weapon: ItemDef, lookup: Lookup): PerkColumn[] => {
  const weaponPerksCategory = weapon.sockets?.socketCategories?.find(category => category.socketCategoryHash === WEAPON_PERKS_CATEGORY);
  if (!weaponPerksCategory || weaponPerksCategory.socketIndexes.length === 0) {
    return [];
  }

  const perkColumns: PerkColumn[] = [];

  for (const socketIndex of weaponPerksCategory.socketIndexes) {
    const socketEntry = weapon.sockets?.socketEntries[socketIndex];
    if (!socketEntry) {
      continue;
    }

    const setHash = socketEntry.randomizedPlugSetHash ?? socketEntry.reusablePlugSetHash;

    if (setHash === undefined) continue;
    const set = lookup.plugSet(setHash);
    if (!set) continue;

    const perks = new Map<number, Perk>();
    for (const plugItem of set.reusablePlugItems) {
      if (plugItem.currentlyCanRoll === false) continue;
      const perkItem = lookup.item(plugItem.plugItemHash);
      if (!perkItem) continue;

      const plugCategoryIdentifier = perkItem.plug?.plugCategoryIdentifier;
      if (plugCategoryIdentifier === undefined) continue;
      if (EXCLUDED_PLUG_CATEGORIES.has(plugCategoryIdentifier)) continue;
      if (perkItem.displayProperties.name === "") continue;

      const itemTypeDisplayName = perkItem.itemTypeDisplayName;
      if (itemTypeDisplayName === undefined) continue;

      logger.print('debug', `PCI: ${plugCategoryIdentifier} | PerkType: ${itemTypeDisplayName} | PerkName: ${perkItem.displayProperties.name} | ${itemTypeDisplayName.startsWith("Enhanced")} | ${perkItem.inventory?.tierType === 3}`);

      const perk: Perk = {
        hash: perkItem.hash,
        name: perkItem.displayProperties.name,
        isEnhanced: itemTypeDisplayName.startsWith("Enhanced"),
      }


      perks.set(perkItem.hash, perk);
    }
    if (perks.size === 0) continue;

    perkColumns.push({ columnIndex: perkColumns.length, perks: [...perks.values()] });
  }

  return perkColumns;
}

const buildWeaponIndex = async (indexPath: string, manifestPath: string): Promise<void> => {
  /**
  const tempPath = indexPath + ".tmp";
  const db = new DatabaseSync(tempPath);
  db.exec(`CREATE TABLE weapons (
    hash INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    tierType INTEGER,
    idx INTEGER
  );`)
  
  db.exec(`CREATE TABLE weapon_perks (
    weapon_hash INTEGER NOT NULL REFERENCES weapons(hash),
    column_index INTEGER NOT NULL,
    perk_hash INTEGER NOT NULL,
    perk_name TEXT NOT NULL,
    is_curated INTEGER NOT NULL
    );`)

  db.exec(`CREATE INDEX idx_perks_name ON weapon_perks(perk_name);`)
  db.exec(`CREATE INDEX idx_perks_weapon ON weapon_perks(weapon_hash);`)
 
  const insertWeapon = db.prepare(`
    INSERT INTO WEAPONS (hash, name, type, tierType, idx) 
    VALUES ($hash, $name, $type, $tierType, $idx);`);
  const insertPerk = db.prepare(`
    INSERT INTO weapon_perks (weapon_hash, column_index, perk_hash, perk_name, is_curated) 
    VALUES ($weapon_hash, $column_index, $perk_hash, $perk_name, $is_curated);`);
  **/
  const manifestDb = new DatabaseSync(manifestPath, {readOnly: true});

  const listWeapons = manifestDb.prepare(`
    SELECT id, json FROM DestinyInventoryItemDefinition
    WHERE json_extract(json, '$.itemType') = 3
    `);

  const { item, plugSet, stats } = createLookup(manifestDb);
  
  item(4184168210); // Look up a fatebringer twice
  logger.print('info', `Item lookup stats: ${stats.itemStats.hits} hits, ${stats.itemStats.misses} misses.`);
  item(4184168210);
  logger.print('info', `Item lookup stats: ${stats.itemStats.hits} hits, ${stats.itemStats.misses} misses.`);

  const fateBringer = item(4184168210);
  if (fateBringer) {
    const fateBringerPerkColumns = extractPerkColumns(fateBringer, { item, plugSet });
    for (const column of fateBringerPerkColumns) {
      logger.print('info', `Column ${column.columnIndex} has ${column.perks.length} perks. ${column.perks.filter(perk => perk.isEnhanced).length} are enhanced.`);
      // logger.print('info', `Perks: ${column.perks.map(perk => perk.name).join(', ')}`)
    }
  }

  const performanceStart = performance.now();
  let weaponCount = 0;

  for (const row of listWeapons.iterate()) {
    const weapon = JSON.parse(row.json as string);
    weaponCount++;
  }

  logger.print('info', `Total weapons processed: ${weaponCount}`);
  const performanceEnd = performance.now();
  logger.print('info', `Weapon index build in ${((performanceEnd - performanceStart) / 1000).toFixed(2)} seconds.`);
}

export { buildWeaponIndex };