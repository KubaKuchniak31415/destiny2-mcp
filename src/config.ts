import * as logger from './utilities/logger.ts';

const key = process.env.BUNGIE_API_KEY;

if (!key) {
  logger.print('error', 'BUNGIE_API_KEY environment variable is not set.');
  throw new Error('BUNGIE_API_KEY environment variable is not set.');
}

const BUNGIE_API_KEY: string = key;

export default BUNGIE_API_KEY;