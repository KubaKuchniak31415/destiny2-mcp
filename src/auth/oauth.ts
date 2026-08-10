import { BUNGIE_CLIENT_ID, BUNGIE_CLIENT_SECRET, BUNGIE_REDIRECT_URI } from '../config.ts';
import type {Token, TokenResponse} from '../types.ts';
import { tokenResponseSchema } from '../types.ts';
import * as z from 'zod/v4';

const oAuthErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
})

type OAuthError = z.infer<typeof oAuthErrorSchema>;
  

const buildAuthorizeUrl = (state: string): string => {
  const params = new URLSearchParams({
    client_id: BUNGIE_CLIENT_ID,
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
  const credentials = Buffer.from(`${BUNGIE_CLIENT_ID}:${BUNGIE_CLIENT_SECRET}`)
  .toString('base64');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      "Authorization": `Basic ${credentials}`,
      "X-API-Key": process.env.BUNGIE_API_KEY
    },
    body: body
  })

  const tokenResponse = tokenResponseSchema.safeParse(await response.json());
  if (!tokenResponse.success) {
    const errorResponse = oAuthErrorSchema.safeParse(await response.json());
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