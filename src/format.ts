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
  [2, 'Common'],
  [3, 'Uncommon'],
  [4, 'Rare'],
  [5, 'Legendary'],
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

export const formatItem = (item :ResolvedItem, long: boolean = false): string => {
  let statsString = ''
  if (item.kind === 'armour') {
    for (const [k, v] of Object.entries(item.stats)) {
      statsString += `${k[0]?.toUpperCase()}${v}/`
    }
    statsString = statsString.slice(0,-1)
  }

  const type = item.kind === 'armour' 
    ? `${item.type.startsWith(item.classType) ? item.type : `${item.classType} ${item.type}`}` 
    : `${item.element} ${item.type} (${item.slot.split(' ')[0]} Slot)`
  
  const location = item.equipped === true ? `${item.location} (Equipped)` : `${item.location}`

  const base = `${item.name} | ${item.rarityName} ${type} | ${item.power ?? '?'} | ${location}${item.kind === 'armour' ? ` | ${statsString}` : ''} | ${item.itemInstanceId}` 

  if (long && item.kind === 'weapon' && item.rolledPerks?.length) {
    const rolls = item.rolledPerks.map(col => 
      `Column ${col.columnIndex+1}: ` +
      col.perks.map(p => p.selected ? `${p.name}*`: p.name).join(' | ')
    )
    return [base, ...rolls].join('\n')
  }

  return base
}

export const formatItems = (count: number,  items: ResolvedItem[], long: boolean = false): string => {

  if (items.length === 0) {
    return 'No items matched the search parameters'
  }

  let formatted = `Name | Rarity type slot | Power | Location (Equipped) | [Armour stats Health/Melee/Grenade/Super/Class/Weapons] | Instance ID\n`
  if (long) {
    formatted += `Perk Columns (* means perk is currently selected)\n`
  }
    formatted += items.map(i => `${formatItem(i, long)}`).join('\n')

  formatted += `\nShowing ${items.length} of ${count} items`

  return formatted
}