import {getManifestContentPath, getManifestVersion} from './bungie.ts';
import { getIndex } from './db.ts';
import { formatPerkColumn } from './format.ts';
import * as logger from './utilities/logger.ts';

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

main();