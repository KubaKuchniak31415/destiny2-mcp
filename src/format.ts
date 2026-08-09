import type { Weapon, PerkColumn, Perk } from "./types.ts";


const TIER_NAMES = new Map<number, string>([
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