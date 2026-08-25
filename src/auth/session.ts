import { randomUUID } from "node:crypto"
import { waitForCode } from "./callback.ts";
import { exchangeCode, refreshToken, buildAuthorizeUrl } from "./oauth.ts";
import type { Token } from "../types.ts";
import * as logger from "../utilities/logger.ts"
import {readTokens, isAccessExpired, isRefreshExpired, writeTokens} from "./tokens.ts"

class ReauthRequired extends Error {
  constructor (msg: string, options: ErrorOptions = {}) {
    super(msg, options);

    Object.setPrototypeOf(this, ReauthRequired.prototype)
  }
}

let pendingAuth: Promise<string> | undefined;

const beginReauth = (): string => {
  const state = randomUUID()
  pendingAuth = waitForCode(state, 300_000)
  pendingAuth.catch(() => {})
  return buildAuthorizeUrl(state);
};

const completeReauth = async (waitMs = 5000): Promise<Token | 'pending'> => {
  if (!pendingAuth) throw new ReauthRequired('No authorization in progress!');

  let code: string | 'pending';
  try {
    code = await Promise.race([
      pendingAuth,
      new Promise<'pending'>(r => setTimeout(() => r('pending'), waitMs))
    ]);
  } catch (err) {
    pendingAuth = undefined;
    throw new ReauthRequired(`Authorization Failed, starting over.`, {cause: err})
  }

  if (code === 'pending') return 'pending';
  pendingAuth = undefined;
  const token = await exchangeCode(code)
  await writeTokens(token);
  return token;
} 

const makeAccessToken = async (): Promise<Token> => {
  const existingToken = await readTokens()
  if (existingToken) {
    if (!isAccessExpired(existingToken)) {
      return existingToken
    }
    if (!isRefreshExpired(existingToken)) {
      try {
        logger.print('info', "Refreshing token")
        const token = await refreshToken(existingToken.refresh_token)
        await writeTokens(token);
        return token
      } catch (err) {
        logger.print('error', `${err}`)
        throw new ReauthRequired(`Refresh is expired or invalid, please reauthenticate.`, {cause: err});
      }
    }
  }
  throw new ReauthRequired(`No valid token found, please reauthenticate.`);
}

let accessTokenPromise: Promise<Token> | undefined;

const getAccessToken = async (): Promise<Token> => {
  accessTokenPromise ??= makeAccessToken()
    .finally(() => { accessTokenPromise = undefined;})
  return accessTokenPromise
}

export {getAccessToken, beginReauth, completeReauth, ReauthRequired}