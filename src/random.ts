import {getManifestContentPath, getManifestVersion} from './bungie.ts';
import {ensureManifest} from './manifest.ts';
import * as logger from './utilities/logger.ts';
import {buildWeaponIndex} from './weaponIndex.ts';

const main = async () => {
  const manifestVersion = await getManifestVersion();
  logger.print('info', 'Fetching manifest version...');
  logger.print('info', manifestVersion);
  const contentPath = await getManifestContentPath();
  logger.print('info', 'Fetching manifest content path...');
  logger.print('info', contentPath);
  //await download(contentPath, `manifest/manifest-${manifestVersion}.content`);
  await ensureManifest();
  buildWeaponIndex(`manifest/weapon-index-${manifestVersion}.db`, `manifest/world-${manifestVersion}.sqlite`);
}

main();