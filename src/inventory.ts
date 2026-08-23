import type { Index } from './db.ts';
import type { PerkColumn, Item, InstancedItem, Instance, Profile, ItemStats, ResolvedWeapon, ResolvedArmour, ResolvedBase, ClassType, ResolvedItem, Element, Sockets } from './types.ts';
import { isInstanced } from './types.ts';
import { TIER_NAMES } from './format.ts';
import * as logger from './utilities/logger.ts'



export const DAMAGE_TYPES = new Map<number, Element>([
  [0, 'None'],
  [1, 'Kinetic'],
  [2, 'Arc'],
  [3, 'Solar'],
  [4, 'Void'],
  [5, 'Raid'],
  [6, 'Stasis'],
  [7, 'Strand']
])

export type Where =
  | { kind: 'vault' }
  | { kind: 'character'; characterId: string };

export type Located = {
  item: InstancedItem;
  instance?: Instance;
  where: Where;
  equipped: boolean;
  stats?: Record<number, number>;
  sockets?: Sockets
  reusablePlugs?: number[]
};

const BUCKET_MAP = new Map<number, { slot: string; kind: 'weapon' | 'armour' }>([
  [1498876634, { slot: 'Kinetic Weapons', kind: 'weapon' }],
  [2465295065, { slot: 'Energy Weapons', kind: 'weapon' }],
  [953998645, { slot: 'Power Weapons', kind: 'weapon' }],
  [3448274439, { slot: 'Helmet', kind: 'armour' }],
  [3551918588, { slot: 'Gauntlets', kind: 'armour' }],
  [14239492, { slot: 'Chest Armor', kind: 'armour' }],
  [20886954, { slot: 'Leg Armor', kind: 'armour' }],
  [1585787867, { slot: 'Class Armor', kind: 'armour' }],
]);

export const gearResolver = (located: Located, index: Index, names: Map<string, string>): ResolvedWeapon | ResolvedArmour | null  => {
  const gear = index.getGear(located.item.itemHash);

  if (!gear) {
    return null;
  }
  const characterId = located.where.kind === 'character' ? located.where.characterId : undefined
  const location = characterId ? names.get(characterId) ?? 'unknown' : 'Vault';
  
  const bucket = BUCKET_MAP.get(gear.bucketTypeHash)
  

  if (!bucket){
    return null
  }
  const resolvedBase: ResolvedBase = {
    itemHash: located.item.itemHash,
    itemInstanceId: located.item.itemInstanceId,
    name: gear.name,
    type: gear.type,
    rarity: gear.tierType ?? 0,
    rarityName: TIER_NAMES.get(gear.tierType ?? 0) ?? 'Unknown',
    slot: bucket.slot,
    location,
    equipped: located.equipped,
    characterId: characterId,
    power: located.instance?.primaryStat?.value
  }

  if (bucket.kind === 'weapon') {
    const possiblePerkMap = index.getWeaponPerks(located.item.itemHash, true)
    const socketed = new Set(
      located.sockets?.map(s => s.plugHash).filter(h => h !== undefined) ?? []
    );
    const candidates = new Set ([...socketed, ...(located.reusablePlugs ?? [])])
    const rolledPerks = new Map<number, PerkColumn>()

    for (const [idx, col] of possiblePerkMap.entries()) {
      for (const perk of col) {
        if (candidates.has(perk.hash)) {
          if (!(rolledPerks.has(idx))) {
            rolledPerks.set(idx, {
              columnIndex: idx,
              perks: []
            })
          }
          if (socketed.has(perk.hash)) perk.selected = true;
          rolledPerks.get(idx)?.perks.push(perk)
        }
      }
    }
    let perkString = `${gear.name}`
    for (const [idx, col] of rolledPerks) {
      perkString += `Column ${idx}: `
      for (const perk of col.perks) {
        if (perk.selected) {
          perkString += `${perk.name}* |`
        } else {
          perkString += `${perk.name} |`
        }
      }
      perkString += '\n'
    }
    logger.print('debug', `${perkString}`)

    const perkColumns: PerkColumn[] = []

    for (const [idx, col] of rolledPerks) {
      perkColumns[idx] = col
    }

      
    return {...resolvedBase, kind: 'weapon', element: DAMAGE_TYPES.get(located.instance?.damageType ?? 0) ?? 'None', rolledPerks: perkColumns}
  } else {
    const armourStats = {
      health:  located.stats?.[392767087]  ?? 0,
      melee:   located.stats?.[4244567218] ?? 0,
      grenade: located.stats?.[1735777505] ?? 0,
      super:   located.stats?.[144602215]  ?? 0,
      class:   located.stats?.[1943323491] ?? 0,
      weapons: located.stats?.[2996146975] ?? 0,
    }
    if (gear.classType === null) {
      return null
    }
    const classTypeMap = new Map<number, string>([
      [0, 'Titan'],
      [1, 'Hunter'],
      [2, 'Warlock'],
      [3, 'Any']
    ])
    
    return { ...resolvedBase, kind: 'armour', stats: armourStats, classType: classTypeMap.get(gear.classType) as ClassType};  }
}

export const characterNames = (profile: Profile): Map<string, string> =>
  new Map(
    Object.entries(profile.characters.data ?? {})
      .map(([characterId, c]) => [characterId, c.classType])
  );

export const flattenProfile = (
  profile: Profile
): Located[] => {
  const instances = profile.itemComponents.instances.data ?? {};
  const statsByInstance = profile.itemComponents.stats.data ?? {};
  const socketsByInstance = profile.itemComponents.sockets.data ?? {};
  const candidatesByInstance= profile.itemComponents.reusablePlugs.data ?? {}
  const located: Located[] = [];

  const flattenStats = (raw?: ItemStats): Record<number, number> | undefined => 
    raw && Object.fromEntries(
      Object.entries(raw).map(([hash, {value}]) => [Number(hash), value])
    )

  const flattenPlugs = (raw?: Record<string, { plugItemHash: number }[]>): number[] | undefined =>
    raw && Object.values(raw).flatMap(opts => opts.map(o => o.plugItemHash));


  const take = (items: Item[], where: Where, equipped: boolean) => {
    for (const item of items) {
      if (!isInstanced(item)) continue;

      located.push({
        item,
        instance: instances[item.itemInstanceId],
        where,
        equipped,
        stats: flattenStats(statsByInstance[item.itemInstanceId]?.stats),
        sockets: socketsByInstance[item.itemInstanceId]?.sockets,
        reusablePlugs: flattenPlugs(candidatesByInstance[item.itemInstanceId]?.plugs) 
      });
    }
  };

  take(profile.profileInventory.data?.items ?? [], { kind: 'vault' }, false);

  for (const [characterId, inv] of Object.entries(profile.characterInventories.data ?? {})) {
    take(inv.items, { kind: 'character', characterId }, false);
  }

  for (const [characterId, eq] of Object.entries(profile.characterEquipment.data ?? {})) {
    take(eq.items, { kind: 'character', characterId }, true);
  }

  return located;
};

export type ItemFilterOptions = {
  slot?: 'Kinetic Weapons' | 'Energy Weapons' | 'Power Weapons' | 'Helmet' | 'Gauntlets' | 'Chest Armor' | 'Leg Armor' | 'Class Armor';
  location?: 'Hunter' | 'Titan' | 'Warlock' | 'Vault';
  classType?: ClassType
  name?: string;
  rarity?: number;
  kind?: 'weapon' | 'armour';
  element?: 'Kinetic' | 'Solar' | 'Arc' | 'Void' | 'Stasis' | 'Strand'
  equipped?: boolean
  limit?: number;
  offset?: number;
}

export type ItemSortingOptions = 'Power' | 'Name'| 'Rarity'

export const filterItems = (items: ResolvedItem[], filterOptions: ItemFilterOptions = {}, sortingOptions: ItemSortingOptions = 'Power'): {count: number, items: ResolvedItem[]} => {
  items = [...items];

  if (filterOptions.slot) {
    items = items.filter(i => i.slot === filterOptions.slot)
  }

  if (filterOptions.location) {
    items = items.filter(i => i.location === filterOptions.location)
  }

  if (filterOptions.classType) {
    items = items.filter(i => i.kind === 'armour' && 
      (i.classType === filterOptions.classType || i.classType === 'Any'))
  }

  if (filterOptions.rarity !== undefined) {
    items = items.filter(i => i.rarity === filterOptions.rarity)
  }

  if (filterOptions.name) {
    const name = filterOptions.name.toLowerCase()
    items = items.filter((i) => i.name.toLowerCase().includes(name))
  }

  if (filterOptions.kind) {
    items = items.filter(i => i.kind === filterOptions.kind)
  }

  if (filterOptions.element) {
    items = items.filter(i => i.kind === 'weapon' && (i.element === filterOptions.element))
  } 

  if (filterOptions.equipped !== undefined) {
    items = items.filter(i => i.equipped === true)
  }





  switch (sortingOptions) {
    case 'Name': items.sort((a,b) => a.name.localeCompare(b.name)); break;
    case 'Power': items.sort((a,b) => (b.power ?? 0) - (a.power ?? 0)); break;
    case 'Rarity': items.sort((a,b) => (b.rarity) - (a.rarity)); break;
  }

  const count = items.length

  if (filterOptions.offset) {
    items = items.slice(filterOptions.offset)
  }

  if (filterOptions.limit) {
    items = items.slice(0, filterOptions.limit)
  }

  
  return {count, items};
}


// Every copy of a given itemHash, across the vault and all characters.
export const byItemHash = (located: Located[]): Map<number, Located[]> => {
  const map = new Map<number, Located[]>();
  for (const entry of located) {
    const copies = map.get(entry.item.itemHash);
    if (copies) copies.push(entry);
    else map.set(entry.item.itemHash, [entry]);
  }
  return map;
};