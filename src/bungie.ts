import * as logger from './utilities/logger.ts';

const getManifestVersion = async () => {
  const response = await fetch('https://www.bungie.net/Platform/Destiny2/Manifest/');
  if (!response.ok) {
    logger.print('error', `Failed to fetch manifest version: ${response.status} ${response.statusText}`);
    throw new Error(`Failed to fetch manifest version: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const version = data.Response.version;

  return version;
}

export default getManifestVersion;