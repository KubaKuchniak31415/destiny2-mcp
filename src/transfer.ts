
import { join } from "node:path";
import { BungieError, equipItem, pullFromPostmaster, transferItem } from "./bungie.ts";
import { CONFIG_DIR } from "./config.ts";
import { filterItems, type ItemFilterOptions } from "./inventory.ts"
import { getMembership, invalidateProfile } from "./profile.ts";
import type { Profile, ResolvedItem } from "./types.ts"



type Location = 'Titan' | 'Hunter' | 'Warlock' | 'Vault'

export type Leg = 
  | { kind: 'pullFromPostmaster'; itemId: string; itemHash: number; characterId: string }
  | { kind: 'toVault'; itemId: string; itemHash: number; from: string; eviction?: boolean }
  | { kind: 'fromVault'; itemId: string; itemHash: number; to: string; replacement?: boolean}
  | { kind: 'equip'; itemId: string; characterId: string; reason: 'displace' | 'arrive'}

export const resolveDestination = (profile: Profile, destination: Location): string | 'Vault' => {
  if (destination === 'Vault') return 'Vault';

  const matches = Object.entries(profile.characters.data ?? {})
    .filter(([, c]) => c.classType === destination)
    .map(([characterId]) => characterId);
  
  if (matches.length === 0) throw new Error(`You have no ${destination} character`)
  if (matches.length > 1) throw new Error(`You have ${matches.length} ${destination}s interesting choice (delete one please)`)

  const [characterId] = matches;
  if (characterId === undefined) {
    throw new Error('Unable to resolve character ID')
  }
  
  return characterId;
}


export const planRoute = (item: ResolvedItem, destination: string | 'Vault', options: {equip?: boolean, replacement?: ResolvedItem}): Leg[] => {
  const legs: Leg[] = []
  const {characterId, itemInstanceId: itemId, itemHash} = item
  const start = characterId ?? 'Vault';


  
  if (item.inPostmaster) {
    if (item.characterId) {
      legs.push({kind: 'pullFromPostmaster', itemId, itemHash, characterId: item.characterId})
    }
  }
  if (start !== destination) {
    if (options.replacement && item.equipped) {
      legs.push({
        kind: 'equip',
        itemId: options.replacement.itemInstanceId,
        characterId: start ,
        reason: 'displace'
      })
    }
    if (start !== 'Vault') {
      legs.push({ kind: 'toVault', itemId, itemHash, from: start })
    }
    if (destination !== 'Vault') {
      legs.push({ kind: 'fromVault', itemId, itemHash, to: destination })
    }
  } 

  if (options.equip && destination !== 'Vault') {
    legs.push({ kind: 'equip', itemId, characterId: destination, reason: 'arrive'})
  }

  return legs


}

export const pickReplacement = (items: ResolvedItem[], displaced: ResolvedItem, fromVault: boolean = false): ResolvedItem | undefined => {
  
  const filterOptions: ItemFilterOptions = {
    slot: displaced.slot,
    equipped: false,
    inPostmaster: false,
    ...((!fromVault) ? {characterId: displaced.characterId} : {location: 'Vault'}),
    ...(displaced.kind === 'armour' ? {classType: displaced.classType} : {})
    
  }

  const {items: filteredItems} = filterItems(items, filterOptions, ['NonExotic', 'Power'])
  if (filteredItems.length > 0) {
    return filteredItems[0]
  }
  return undefined
  
}

export const pickEviction = (items: ResolvedItem[], destinationId: string, item: ResolvedItem): ResolvedItem | undefined => {
  const slotFilter = {
    characterId: destinationId, 
    slot: item.slot, 
    inPostmaster: false, 
    equipped: false
  }
  const {items: itemsInSlot} = filterItems(items, slotFilter, ['NonExotic', 'LowPower'])
  const itemToEvict = itemsInSlot[0]
  return itemToEvict
}

type TransferError = {
  name: string,
  description?: string
}
export const ERROR_CODE_MAP = new Map<number, TransferError>([
  [1642, {name: 'DestinyNoRoomInDestination', description: 'The destination slot is full'}],
  [1637, {name: 'DestinyInventoryFull'}],
  [1623, {name: 'DestinyItemNotFound', description: 'stale id — search again'}],
  [1673, {name: 'HasSideEffects', description: 'postmaster pull refused as destructive'}],
  [1632, {name: 'DestinyItemAlreadyInInventory'}],
  [1656, {name: 'DestinyCannotPerformActionOnEquippedItem', description: 'should be unreachable auto-displace failed'}],
  [1641, {name: 'DestinyItemUniqueEquipRestricted', description: 'second exotic'}],
  [1671, {name: 'DestinyCannotPerformActionAtThisLocation', description: 'in an activity'}],
  [1634, {name: 'DestinyCharacterNotInTower'}],
  [1674, {name: 'DestinyItemLocked'}],
  [35, {name: 'throttling'}],
  [51, {name: 'throttling'}],
  [1672, {name: 'throttling'}],
  [1660, {name: 'DestinyItemNotTransferrable'}],
  [1655, {name: 'DestinyCanOnlyEquipInGame', description: 'in an activity'}],
  [2108, {name: 'AccessNotPermittedByApplicationScope', 
    description: `Your bungie app is missing the 'Move and equip destiny gear and other items' scope. ` +
                 `Add it at https://www.bungie.net/en/Application, then delete ` +
                 `${join(CONFIG_DIR, 'tokens.json')} and reauthorise.`}],
])

export const translateErrorCode = (errorCode: number): TransferError | undefined => 
  ERROR_CODE_MAP.get(errorCode) 

export type MoveResult = { completed: Leg[]; failed?: {leg: Leg; error: BungieError}}

export const moveItem = async (legs: Leg[]): Promise<MoveResult> => {
  const {membershipType} = await getMembership()
  const completed: Leg[] = []
  if (legs.length === 0) return { completed }
  for (const leg of legs) {
    try {
      switch (leg.kind) {
        case 'pullFromPostmaster':  await pullFromPostmaster(membershipType, leg.characterId, leg.itemId, leg.itemHash); break;
        case 'equip': await equipItem(membershipType, leg.characterId, leg.itemId); break;
        case 'fromVault': await transferItem(membershipType, leg.to, leg.itemHash, leg.itemId, false); break;
        case 'toVault':  await transferItem(membershipType, leg.from, leg.itemHash, leg.itemId, true); break;
        default: { const _exhaustive: never = leg; throw new Error(`Unhandled leg ${JSON.stringify(_exhaustive)}`) }
      }
    } catch (err) {
      if (!(err instanceof BungieError)) throw err;
      return {completed, failed: {leg, error: err}}
    } finally {
      invalidateProfile();
    }
    completed.push(leg);
  }

  return { completed };
}