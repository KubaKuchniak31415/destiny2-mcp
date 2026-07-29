import getManifestVersion from "./bungie.ts";
import * as logger from './utilities/logger.ts';

const main = async () => {
  const version = await getManifestVersion();
  logger.print('info', `Successfully fetched manifest version: ${version}`);
}

main()

