import {getManifestVersion, bungieFetch} from './bungie.ts';
import * as logger from './utilities/logger.ts';

const main = async () => {
  const manifestVersion = await getManifestVersion();
  logger.print('info', 'Fetching manifest version...');
  logger.print('info', manifestVersion);
}

main();
