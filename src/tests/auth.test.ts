import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAuthorizeUrl, toToken } from '../auth/oauth.ts'
import type {TokenResponse} from '../types.ts'

test('conversion from TokenResponse to Token is valid and times stay consistent', () => {
  const fixedNow =1_000_000
  const tokenResponse: TokenResponse = {
    access_token: "123",
    token_type: "access",
    refresh_token: "321",
    expires_in: 3600,
    refresh_expires_in: 7200,
    membership_id: "456" 
  }  

  assert.deepEqual(toToken(tokenResponse, fixedNow),
  {
    access_token: "123",
    refresh_token: "321",
    expires_at_seconds: 1_003_600,
    refresh_expires_at_seconds: 1_007_200,
    membership_id: "456" 
  })
})

test('buildAuthorizeUrl returns a valid url', () => {
  const state = "testState"
  const url = buildAuthorizeUrl(state)
  const parsedUrl = new URL(url)

  assert.strictEqual(parsedUrl.origin, 'https://www.bungie.net')
  assert.strictEqual(parsedUrl.pathname, '/en/oauth/authorize')
  assert.strictEqual(parsedUrl.searchParams.get('client_id'), process.env.BUNGIE_CLIENT_ID)
  assert.strictEqual(parsedUrl.searchParams.get('response_type'), 'code')
  assert.strictEqual(parsedUrl.searchParams.get('state'), state)
  assert.strictEqual(parsedUrl.searchParams.get('redirect_uri'), process.env.BUNGIE_REDIRECT_URI)
});