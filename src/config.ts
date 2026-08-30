import { join } from 'node:path';
import * as logger from './utilities/logger.ts';
import { homedir } from 'node:os';

class ConfigError extends Error {
  missing: string[];

  constructor (missing: string[], options: ErrorOptions = {}) {
    super(describeMissing(missing), options);
    
    this.name = 'ConfigError';
    this.missing = missing
    Object.setPrototypeOf(this, ConfigError.prototype)
  }
}

const REQUIRED = ['BUNGIE_API_KEY', 'BUNGIE_CLIENT_ID', 'BUNGIE_CLIENT_SECRET'] as const

const missing = (): string[] => REQUIRED.filter(n => !process.env[n])

const required = (name: typeof REQUIRED[number]): string => {
  const value = process.env[name]
  if (!value) {
    logger.print('error', `${describeMissing(missing())}`)
    throw new ConfigError(missing())
  }
  return value;
}

const describeMissing = (missing: string[]): string => [
  `Destiny 2 MCP is not configured. Missing: ${missing.join(', ')}`,
  `Open Claude Desktop -> Settings -> Extensions -> Destiny 2 and fill in the missing values`,
  `Then fully quit and reopen Claude Desktop. README step 2 explains where to get each value`,
].join('\n')

const configHome = 
  process.platform === 'win32'
    ? process.env.APPDATA ?? join(homedir(), '.config')
    : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');


export const CONFIG_DIR = join(configHome, 'destiny2-mcp');

export  const config = 
  {
    get apiKey() {return required('BUNGIE_API_KEY')},
    get clientId() {return required('BUNGIE_CLIENT_ID')},
    get clientSecret() {return required('BUNGIE_CLIENT_SECRET')}
  }

export const BUNGIE_REDIRECT_URI = process.env.BUNGIE_REDIRECT_URI ??
'https://127.0.0.1:7777/callback';

const redirectUrl = new URL(BUNGIE_REDIRECT_URI)
const parsedPort = Number.parseInt(redirectUrl.port, 10);
export const REDIRECT_PORT = Number.isNaN(parsedPort) ? 7777 : parsedPort;


