import { DatabaseSync, StatementSync } from "node:sqlite";
import * as logger from "./utilities/logger.ts";
import { toDbId } from "./utilities/hash.ts";
import { rename, unlink, } from "node:fs/promises";


type SocketCategory = {socketCategoryHash: number; socketIndexes: number[]}

// SocketEntries are the definitions of a specific socket on an item
// The randomized and reusable plugsets are essentially the perk pool for each socket say barrel, mag, perk1 and perk2
// A socket generally has one or the other never both i assume randomized is for rng rolls in perk1, perk2 and reusable is for mags etc.
type SocketEntry = {
  randomizedPlugSetHash?: number;
  reusablePlugSetHash?: number;
}

type Perk = {hash: number; name: string; isEnhanced: boolean}
type PerkColumn = {columnIndex: number; perks: Perk[]}

// The socket category that contains weapon perks
const WEAPON_PERKS_CATEGORY = 4241085061;

// The plug categories that we dont want like trackers and stuff that arent useful to us
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
  index: number;
}

// The plugset definition is basically the perk pool for a given socket. Optional boolean to see if perk can be rolled.
// Counter-intuitively if the boolean isnt present it means the perk can be rolled
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

type ExtractStats = {
  noPerkCategory: number;
  socketOutOfRange: number;
  noPlugSet: number;
  unresolvedPlugSet: number;
  unresolvedPlug: number;
  namelessPlug: number;
  emptyColumn: number;
  zeroColumns: number;
}

const createExtractStats = (): ExtractStats => {
  return {
    noPerkCategory: 0,
    socketOutOfRange: 0,
    noPlugSet: 0,
    unresolvedPlugSet: 0,
    unresolvedPlug: 0,
    namelessPlug: 0,
    emptyColumn: 0,
    zeroColumns: 0
  };
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

  // Helper function to cache results for either item or plugset lookups.
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

const extractPerkColumns = (weapon: ItemDef, lookup: Lookup, extractStats = createExtractStats()): PerkColumn[] => {
  // Get all the sockets for the weapon that contain perks.
  const weaponPerksCategory = weapon.sockets?.socketCategories?.find(category => category.socketCategoryHash === WEAPON_PERKS_CATEGORY);
  if (!weaponPerksCategory || weaponPerksCategory.socketIndexes.length === 0) {
    extractStats.noPerkCategory++;
    return [];
  }

  const perkColumns: PerkColumn[] = [];

  for (const socketIndex of weaponPerksCategory.socketIndexes) {
    const socketEntry = weapon.sockets?.socketEntries[socketIndex];
    if (!socketEntry) {
      extractStats.socketOutOfRange++;
      continue;
    }

    // Since the socket has either a randomized or reusable plugset we take either, it doesn't make a difference
    const setHash = socketEntry.randomizedPlugSetHash ?? socketEntry.reusablePlugSetHash;

    if (setHash === undefined) {
      extractStats.noPlugSet++;
      continue;
    }
    const set = lookup.plugSet(setHash);
    if (!set) {
      extractStats.unresolvedPlugSet++;
      continue;
    }

    const perks = new Map<number, Perk>();

    // A reusablePlugItem is a perk in a column
    for (const plugItem of set.reusablePlugItems) {
      if (plugItem.currentlyCanRoll === false) continue;

      const perkItem = lookup.item(plugItem.plugItemHash);
      if (!perkItem) {
        extractStats.unresolvedPlug++;
        continue;
      }

      const plugCategoryIdentifier = perkItem.plug?.plugCategoryIdentifier;

      if (plugCategoryIdentifier && EXCLUDED_PLUG_CATEGORIES.has(plugCategoryIdentifier)) continue;
      const name = perkItem.displayProperties?.name;
      if (!name) {
        extractStats.namelessPlug++;
        continue;
      }

      // itemTypeDisplayName can be used to determine if a perk is enhanced or not.
      const itemTypeDisplayName = perkItem.itemTypeDisplayName;

      const perk: Perk = {
        hash: perkItem.hash,
        name: name,
        isEnhanced: itemTypeDisplayName?.startsWith("Enhanced") ?? false,
      }


      perks.set(perkItem.hash, perk);
    }
    if (perks.size === 0) {
      extractStats.emptyColumn++;
      continue;
    }

    perkColumns.push({ columnIndex: perkColumns.length, perks: [...perks.values()] });
  }
  if (perkColumns.length === 0) {
    extractStats.zeroColumns++;
  }

  return perkColumns;
}

const buildWeaponIndex = async (indexPath: string, manifestPath: string): Promise<void> => {
  logger.print('info', `Building weapon index from ${manifestPath} to ${indexPath}`);
  const tempPath = indexPath + ".tmp";
  await unlink(tempPath).catch(() => {});
  const db = new DatabaseSync(tempPath);
  let manifestDb: DatabaseSync | undefined;
  try {
    try {
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
        is_enhanced INTEGER NOT NULL,
        UNIQUE(weapon_hash, column_index, perk_hash)
        );`)
    
      const insertWeapon = db.prepare(`
        INSERT INTO weapons (hash, name, type, tierType, idx) 
        VALUES ($hash, $name, $type, $tierType, $idx);`);
      const insertPerk = db.prepare(`
        INSERT INTO weapon_perks (weapon_hash, column_index, perk_hash, perk_name, is_enhanced) 
        VALUES ($weapon_hash, $column_index, $perk_hash, $perk_name, $is_enhanced);`);
      
      manifestDb = new DatabaseSync(manifestPath, {readOnly: true});

      const listWeapons = manifestDb.prepare(`
        SELECT id, json FROM DestinyInventoryItemDefinition
        WHERE json_extract(json, '$.itemType') = 3
        `);

      const lookup = createLookup(manifestDb);
      

      const performanceStart = performance.now();
      let weaponCount = 0;

      let perkRowCount = 0;
      const extractStats = createExtractStats()
      db.exec('BEGIN');
      for (const row of listWeapons.iterate()) {
        const weapon: ItemDef = JSON.parse(row.json as string);
        const perkColumns = extractPerkColumns(weapon, lookup, extractStats);
        insertWeapon.run({
          $hash: weapon.hash,
          $name: weapon.displayProperties?.name ?? "",
          $type: weapon.itemTypeDisplayName ?? null,
          $tierType: weapon.inventory?.tierType ?? null,
          $idx: weapon.index
        });
        weaponCount++;
        for (const column of perkColumns) {
          for (const perk of column.perks) {
            insertPerk.run({
              $weapon_hash: weapon.hash,
              $column_index: column.columnIndex,
              $perk_hash: perk.hash,
              $perk_name: perk.name,
              $is_enhanced: perk.isEnhanced ? 1 : 0
            });
            perkRowCount++;
          }
        }
      }
      db.exec('COMMIT');

      db.exec(`CREATE INDEX idx_perks_name ON weapon_perks(perk_name);`)
      db.exec(`CREATE INDEX idx_perks_weapon ON weapon_perks(weapon_hash);`)

      const performanceEnd = performance.now();


      logger.print('info', `Extract stats: ${JSON.stringify(extractStats)}`);
      logger.print('info', `Lookup stats: ${JSON.stringify(lookup.stats)}`);
      logger.print('info', `Total perks found: ${perkRowCount}`);
      logger.print('info', `Total weapons processed: ${weaponCount}`);
      logger.print('info', `Weapon index build in ${((performanceEnd - performanceStart) / 1000).toFixed(2)} seconds.`);

    } finally {
      db.close();
      manifestDb?.close();
    }
    await rename(tempPath, indexPath);
    logger.print('info', `Weapon index written to ${indexPath}`);
  } catch (err) {
    await unlink(tempPath).catch(() => {});
    throw err;
  } 
}

export { buildWeaponIndex, extractPerkColumns, createExtractStats };
export type { Lookup, ItemDef, PlugSetDef, PerkColumn, ExtractStats };
