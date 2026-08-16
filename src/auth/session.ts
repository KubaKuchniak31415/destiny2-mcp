import { randomUUID } from "node:crypto"
import { waitForCode } from "./callback.ts";
import { exchangeCode, refreshToken, buildAuthorizeUrl } from "./oauth.ts";
import type { Token } from "../types.ts";
import * as logger from "../utilities/logger.ts"
import {readTokens, isAccessExpired, isRefreshExpired, writeTokens} from "./tokens.ts"



const reauthenticate = async (): Promise<Token> => {
  const state = randomUUID();
  const codePromise = waitForCode(state, 120_000);
  const url = buildAuthorizeUrl(state);
  logger.print('info', url)
  const code = await codePromise;
  const token = await exchangeCode(code);
  await writeTokens(token)
  return token;
}

const makeAccessToken = async (): Promise<Token> => {
  const existingToken = await readTokens()
  if (existingToken) {
    const currentTime = Date.now() / 1000
    if (!isAccessExpired(existingToken, currentTime)) {
      return existingToken
    } else if (!isRefreshExpired(existingToken, currentTime)) {
      try {
        logger.print('info', "Refreshing token")
        const token = await refreshToken(existingToken.refresh_token)
        await writeTokens(token);
        return token
      } catch (err) {
        logger.print('error', `${err}`)
        throw new Error(`Refresh is expired or invalid, please reauthenticate.`);
      }
    }
  }
  throw new Error(`No valid token found, please reauthenticate.`);
}

let accessTokenPromise: Promise<Token> | undefined;

const getAccessToken = async (): Promise<Token> => {
  accessTokenPromise ??= makeAccessToken()
    .finally(() => { accessTokenPromise = undefined;})
  return accessTokenPromise
}

export {getAccessToken}