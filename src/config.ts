import * as logger from './utilities/logger.ts';



const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    logger.print('error', `${name} environment variable is not set.`);
    throw new Error(`${name} environment variable is not set.`);
  }
  return value;
}

const BUNGIE_API_KEY = required('BUNGIE_API_KEY');
const BUNGIE_CLIENT_ID = required('BUNGIE_CLIENT_ID');
const BUNGIE_CLIENT_SECRET = required('BUNGIE_CLIENT_SECRET');

const BUNGIE_REDIRECT_URI = process.env.BUNGIE_REDIRECT_URI ??
'https://127.0.0.1:7777/callback';

export  {BUNGIE_API_KEY, BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET, BUNGIE_REDIRECT_URI};
