//import {getManifestContentPath, getManifestVersion} from './bungie.ts';
//import { getIndex } from './db.ts';
//import { formatPerkColumn } from './format.ts';
import * as logger from './utilities/logger.ts';
import { getAccessToken } from './auth/session.ts';
import { getMembershipData, getProfile } from './bungie.ts';
import { isInstanced } from './types.ts';
import { characterNames, filterItems, flattenProfile, gearResolver, type ItemFilterOptions } from './inventory.ts';
import { getIndex } from './db.ts';
import { formatItem } from './format.ts';

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

const OAuth = async () => {
  logger.print('info', 'Waiting for token!')
  const token = await getAccessToken();
  logger.print('info', JSON.stringify(token))
  logger.print('info', `${Date.now() / 1000}`)
  const {membershipId, membershipType} = await getMembershipData()
  logger.print('info', `memid: ${membershipId} memtype: ${membershipType}`)
  const index = await getIndex()
  
  const profileData = await getProfile(membershipType, membershipId)
  const characters = profileData.characters.data ?? {};
  for (const [characterId, character] of Object.entries(characters)) {
    const inventoryCount = profileData.characterInventories.data?.[characterId]?.items.filter(i => isInstanced(i)).length ?? 0
    const equippedCount = profileData.characterEquipment.data?.[characterId]?.items.filter(i => isInstanced(i)).length ?? 0

    logger.print('info', `${character.classType}, ${character.light} Light, last played ${character.dateLastPlayed} - ${inventoryCount + equippedCount} Items, ${equippedCount} Equipped `)
  }
  logger.print('info', `\n\n\n\n`)


  const charNames = characterNames(profileData);
  const flattened = flattenProfile(profileData);


  const resArr = flattened.flatMap((l) => {
    const resolved = gearResolver(l, index, charNames)
    if (!resolved) return [];
    return resolved;
  })

  const filterOptions: ItemFilterOptions = {
    rarity: 6,
    equipped: true,
    location: 'Hunter'
  }

  const {count, items} = filterItems(resArr, filterOptions, 'Name')

  for (const i of items) {
    logger.print('info', formatItem(i))
  }
  logger.print('info', `Total of ${count} items before slicing`)
}

OAuth();