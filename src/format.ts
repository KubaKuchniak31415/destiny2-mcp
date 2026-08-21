import type { Weapon, PerkColumn, Perk, ResolvedItem} from "./types.ts";

export const ARMOUR_STATS = new Map<number, string>([
  [392767087, 'Health'],
  [4244567218, 'Melee'],
  [1735777505, 'Grenade'],
  [144602215, 'Super'],
  [1943323491,'Class'],
  [2996146975, 'Weapons'] 
])

export const TIER_NAMES = new Map<number, string>([
  [0, 'Unknown'],
  [1, 'Currency'],
  [2, 'White'],
  [3, 'Green'],
  [4, 'Blue'],
  [5, 'Purple'],
  [6, 'Exotic'],
])


export const formatWeapon = (weapon: Weapon): string => {
  if (!weapon.tierType) {
    return `${weapon.name} - ${weapon.type} (Tier: Unknown)`;
  }
  const tierName = TIER_NAMES.get(weapon.tierType) || 'Unknown';
  return `${weapon.name} - ${weapon.type} (Tier: ${tierName})`;
}

export const formatPerkColumn = (perkColumn: PerkColumn): string => {
  const perkNames = perkColumn.perks.map(perk => perk.name).join(', ');
  return `Column ${perkColumn.columnIndex+1}: ${perkNames}`;
}

export const formatWeaponDescription = (weapon: Weapon, perkColumns: Map<number, Perk[]>): string => {
  const weaponDetails = formatWeapon(weapon);
  const perkDetails = Array.from(perkColumns.entries())
  .map(([columnIndex, perks]) => formatPerkColumn({ columnIndex, perks }))
  .join('\n');
  return `${weaponDetails}\n\nPossible perks (one per column rolls):\n${perkDetails}`;
}

export const formatItem = (item :ResolvedItem): string => {
  //const base = `${item.name} - ${item.type} - ${item.rarityName} - ${item.power} - ${item.location}` 
  if (item.kind === 'weapon') {
    return `${item.name} - ${item.type} - ${item.rarityName} - ${item.power} - ${item.location} - ${item.slot}`
  } else {
    let statsString = ' ';
    for (const [key, value] of Object.entries(item.stats)) {
      statsString += `${key[0]?.toUpperCase()} ${value} | `
    }
    return `${item.name} - ${item.classType} ${item.type} - ${item.rarityName} - ${item.power} - ${item.location} - ${item.slot}` + statsString
  }
}