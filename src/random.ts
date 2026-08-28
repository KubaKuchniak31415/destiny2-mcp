//import {getManifestContentPath, getManifestVersion} from './bungie.ts';
//import { getIndex } from './db.ts';
//import { formatPerkColumn } from './format.ts';
import * as logger from './utilities/logger.ts';
import { getAccessToken } from './auth/session.ts';
import { getMembershipData, getProfile, transferItem } from './bungie.ts';
import { isInstanced } from './types.ts';
import { characterNames, filterItems, type ItemFilterOptions } from './inventory.ts';
import { formatItems } from './format.ts';
import { getResolvedItems } from './profile.ts';
import { pickReplacement } from './transfer.ts';
import { resolve } from 'node:dns';

/*
const main = async () => {
  const manifestVersion = await getManifestVersion();
  logger.print('info', 'Fetching manifest version...');
  logger.print('info', manifestVersion);
  const contentPath = await getManifestContentPath();
  logger.print('info', 'Fetching manifest content path...');
  logger.print('info', contentPath);
  //await download(contentPath, `manifest/manifest-${manifestVersion}.content`);
  const index = await getIndex();
  logger.print('info', JSON.stringify(index.getWeapon(4184168210)));
  logger.print('info', Array.from(index.getWeaponPerks(4184168210).entries()).map(([columnIndex, perks]) => formatPerkColumn({ columnIndex, perks })).join('\n'));
}
*/

const random = async () => {
  logger.print('info', 'Waiting for token!')
  const token = await getAccessToken();
  logger.print('info', JSON.stringify(token))
  logger.print('info', `${Date.now() / 1000}`)
  const {membershipId, membershipType} = await getMembershipData()
  logger.print('info', `memid: ${membershipId} memtype: ${membershipType}`)
  
  const profileData = await getProfile(membershipType, membershipId)
  for (const sock of profileData.itemComponents?.sockets?.data?.['6917530182775295221']?.sockets ?? []) {
    logger.print('info', `${sock.isEnabled}, ${sock.plugHash}`)
  }
  const characters = profileData.characters.data ?? {};
  for (const [characterId, character] of Object.entries(characters)) {
    const inventoryCount = profileData.characterInventories.data?.[characterId]?.items.filter(i => isInstanced(i)).length ?? 0
    const equippedCount = profileData.characterEquipment.data?.[characterId]?.items.filter(i => isInstanced(i)).length ?? 0

    logger.print('info', `${character.classType}, ${character.light} Light, last played ${character.dateLastPlayed} - ${inventoryCount + equippedCount} Items, ${equippedCount} Equipped `)
  }
  logger.print('info', `\n\n\n\n`)


  const filterOptions: ItemFilterOptions = {
    name: 'anarc',
    location: 'Titan'
  }

  const resolvedItems = await getResolvedItems()
  const {count, items} = filterItems(resolvedItems, filterOptions, 'Power')
  const LONG_THRESHOLD = 10
  let showPerks: boolean | undefined;
  showPerks = undefined

  if (showPerks === undefined) {
    if (filterOptions.perks !== undefined || (filterOptions.limit ?? LONG_THRESHOLD+1) <= LONG_THRESHOLD || count <= LONG_THRESHOLD) {
      showPerks = true
    } else {
      showPerks = false
    }
  }
  
  const formatted = formatItems(count, items, showPerks)
  logger.print('info', formatted)

  const replacement = pickReplacement(resolvedItems, items[0]!, true)

  if (replacement?.kind === 'weapon') {
    logger.print('info', `${items[0]?.name}(${items[0]?.power}) on ${items[0]?.location} replaced with ${replacement.name}(${replacement.power} ${replacement.element}) on ${replacement.location}`)
  }

/*  let hunter: string | undefined

  const charNames = characterNames(profileData)
  for (const [k, v] of charNames.entries()) {
    logger.print('info', `key: ${k}, value: ${v}`)
    if (v === 'Hunter') hunter = k;
  }

  const item = items[0]
  if (item && hunter) {
    logger.print('info', 'Attempting to move truth')
    const res = await transferItem(membershipType, hunter, item.itemHash, item.itemInstanceId, true)
    logger.print('info', `${res.response}`)
  }*/
}

random();