import { join } from 'node:path';
import * as logger from './utilities/logger.ts';
import { homedir } from 'node:os';



const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    logger.print('error', `${name} environment variable is not set.`);
    throw new Error(`${name} environment variable is not set.`);
  }
  return value;
}

const configHome = 
  process.platform === 'win32'
    ? process.env.APPDATA ?? join(homedir(), '.config')
    : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');

const CONFIG_DIR = join(configHome, 'destiny2-mcp');

const BUNGIE_API_KEY = required('BUNGIE_API_KEY');
const BUNGIE_CLIENT_ID = required('BUNGIE_CLIENT_ID');
const BUNGIE_CLIENT_SECRET = required('BUNGIE_CLIENT_SECRET');

const BUNGIE_REDIRECT_URI = process.env.BUNGIE_REDIRECT_URI ??
'https://127.0.0.1:7777/callback';

const redirectUrl = new URL(BUNGIE_REDIRECT_URI)
const parsedPort = Number.parseInt(redirectUrl.port, 10);
const REDIRECT_PORT = Number.isNaN(parsedPort) ? 7777 : parsedPort;

export  {BUNGIE_API_KEY, BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET, BUNGIE_REDIRECT_URI, CONFIG_DIR, REDIRECT_PORT};
