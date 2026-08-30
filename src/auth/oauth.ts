import { config, BUNGIE_REDIRECT_URI } from '../config.ts';
import type {Token, TokenResponse} from '../types.ts';
import { tokenResponseSchema } from '../types.ts';
import * as z from 'zod/v4';
const oAuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
})

  

const buildAuthorizeUrl = (state: string): string => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    state: state,
    redirect_uri: BUNGIE_REDIRECT_URI,
  });

  const oAuthUrlBase = 'https://www.bungie.net/en/oauth/authorize';
  return `${oAuthUrlBase}?${params.toString()}`
}

const toToken = (response: TokenResponse, now: number): Token => {
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at_seconds: now + response.expires_in,
    refresh_expires_at_seconds: now + response.refresh_expires_in,
    membership_id: response.membership_id,
  }
}

const postToken = async (body: URLSearchParams): Promise<Token> => {
  const endpoint = `https://www.bungie.net/platform/app/oauth/token/`;
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`)
  .toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${credentials}`,
      "X-API-Key": config.apiKey
    },
    body: body
  })

  if (!response.ok) {
    throw new Error(`Error fetching ${endpoint}: ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json(); 
  const tokenResponse = tokenResponseSchema.safeParse(payload);
  if (!tokenResponse.success) {
    const errorResponse = oAuthErrorSchema.safeParse(payload);
    if (errorResponse.success) {
      throw new Error(`OAuth error: ${errorResponse.data.error} - ${errorResponse.data.error_description}`);
    } else {
      throw new Error(`Invalid token response format: ${z.prettifyError(tokenResponse.error)}`);
    }
  }
  return toToken(tokenResponse.data, Math.floor(Date.now() / 1000));
}

const exchangeCode = async (code: string): Promise<Token> => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: BUNGIE_REDIRECT_URI,
  });

  return await postToken(body);
}

const refreshToken = async (refreshToken: string): Promise<Token> => {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  
  return await postToken(body);
}

export {
  buildAuthorizeUrl,
  toToken,
  postToken,
  exchangeCode,
  refreshToken
}