import * as logger from './utilities/logger.ts';
import BUNGIE_API_KEY from './config.ts';


const bungieFetch = async (path: string) => {
  const response = await fetch(`${path}`, {
    headers: {
      'X-API-Key': BUNGIE_API_KEY,
    },
  });
  const data = await response.json();
  const errorCode = data.ErrorCode;

  
  if (errorCode !== 1) {
    logger.print('error', `Error fetching manifest version: ${data.ErrorCode} - ${data.ErrorStatus}`);
    throw new Error(`Error fetching manifest version: ${data.ErrorCode} - ${data.ErrorStatus}`);
  }

  return data.Response;
};

const getManifestVersion = async () => {
  const data = await bungieFetch('https://www.bungie.net/Platform/Destiny2/Manifest/');
  const version = data.version;
  return version;
};

const getManifestContentPath = async () => {
  const data = await bungieFetch('https://www.bungie.net/Platform/Destiny2/Manifest/');
  const path = data.mobileWorldContentPaths.en;
  return path;
}

const getManifestContent = async () => {
  const path = await getManifestContentPath();
  const data = await fetch(`https://www.bungie.net${path}`);
}

export {getManifestVersion, bungieFetch};