import { join } from 'node:path';
import type { Token } from '../types.ts';
import { tokenSchema } from '../types.ts';
import { writeFile, readFile, rename, mkdir, unlink } from 'node:fs/promises';
import { CONFIG_DIR } from '../config.ts';
import * as logger from '../utilities/logger.ts';
import * as z from 'zod/v4';

const TOKENS_PATH = join(CONFIG_DIR, 'tokens.json');


const writeTokens = async (tokens: Token): Promise<void> => {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700});
  await writeFile(join(CONFIG_DIR, ".temp"), JSON.stringify(tokens), { mode: 0o600 });
  await rename(join(CONFIG_DIR, ".temp"), TOKENS_PATH);
}

const readTokens = async (): Promise<Token | null> => {
    const data = await readFile(TOKENS_PATH, 'utf8').catch(err => {
      if (err.code === 'ENOENT') return null;
      throw err;
    })

    if (!data) return null;
    try {
      const parsedData = JSON.parse(data);
      const token = tokenSchema.safeParse(parsedData);
      if (!token.success) {
        logger.print('error', `Invalid tokens.json format: ${z.prettifyError(token.error)}`);
        return null;
      }
      return token.data;
    } catch (err) {
      logger.print('error', `Error parsing tokens.json: ${err}`);
      return null;
    }


};

const clearTokens = async (): Promise<void> => {
  await unlink(TOKENS_PATH).catch(err => {
    if (err.code !== 'ENOENT') throw err;
  });
};

const isAccessExpired = (token: Token, now?: number): boolean => {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  return (token.expires_at_seconds - 60) < currentTime;
};

const isRefreshExpired = (token: Token, now?: number): boolean => {
  const currentTime = now ?? Math.floor(Date.now() / 1000);
  return (token.refresh_expires_at_seconds) < currentTime;
};

export { writeTokens, readTokens, clearTokens, isAccessExpired, isRefreshExpired, CONFIG_DIR as TOKENS_DIR};