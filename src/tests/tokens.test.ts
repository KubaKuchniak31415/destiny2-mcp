import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  writeTokens,
  readTokens,
  clearTokens,
  isAccessExpired,
  isRefreshExpired,
  TOKENS_DIR,
} from '../auth/tokens.ts';
import type { Token } from '../types.ts';

// TOKENS_DIR is derived from XDG_CONFIG_HOME at import time, and these tests delete it
// wholesale between cases. If the env var is missing — someone runs `node --test` without
// `--env-file=.env.test`, or the line is dropped from that file — TOKENS_DIR silently resolves
// to the real ~/.config/destiny2-mcp and the first beforeEach destroys the live tokens and TLS
// key. Refusing to run is the only safe response.
if (!TOKENS_DIR.includes('.tmp-test-config')) {
  throw new Error(
    `Refusing to run: TOKENS_DIR is ${TOKENS_DIR}, which is not the test config dir. ` +
      'Run these tests via `npm test` so XDG_CONFIG_HOME is set from .env.test.',
  );
}

const TOKENS_PATH = join(TOKENS_DIR, 'tokens.json');

const validToken: Token = {
  access_token: 'access-abc',
  refresh_token: 'refresh-xyz',
  expires_at_seconds: 1_000_000,
  refresh_expires_at_seconds: 2_000_000,
  membership_id: '4611686018400000000',
};

// Writes a raw string as tokens.json, bypassing writeTokens, to build the corrupt files that
// readTokens has to survive.
const writeRaw = async (contents: string): Promise<void> => {
  await mkdir(TOKENS_DIR, { recursive: true });
  await writeFile(TOKENS_PATH, contents);
};

const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

beforeEach(async () => {
  await rm(TOKENS_DIR, { recursive: true, force: true });
});

// --- expiry helpers -------------------------------------------------------------------------
// Pure functions with an injected clock. The token above expires at 1_000_000 with a refresh
// good until 2_000_000, so every `now` below is chosen relative to those two numbers.

test('isAccessExpired treats a token as expired 60 seconds before it actually expires', () => {
  // The buffer exists so a token that is technically still valid when we check, but expires
  // while the request is in flight, does not come back as a 401. Off-by-one here is invisible
  // in normal use and only shows up as rare, unreproducible auth failures.
  assert.equal(isAccessExpired(validToken, 999_939), false, '61s before expiry: still valid');
  assert.equal(isAccessExpired(validToken, 999_940), false, 'exactly at the buffer edge: still valid');
  assert.equal(isAccessExpired(validToken, 999_941), true, '59s before expiry: inside the buffer');
});

test('isAccessExpired reports a long-past expiry as expired', () => {
  assert.equal(isAccessExpired(validToken, 1_000_001), true);
  assert.equal(isAccessExpired(validToken, 5_000_000), true);
});

test('isAccessExpired honours an injected clock of 0', () => {
  // Regression test. This was `now || Math.floor(...)`, and 0 is both falsy and exactly the
  // value a clock test passes, so the injected clock was silently replaced by the real one and
  // every token looked expired. The `??` is what makes this pass.
  assert.equal(isAccessExpired(validToken, 0), false);
});

test('isRefreshExpired applies no early-expiry buffer, unlike the access token', () => {
  // Deliberate asymmetry: the refresh token lasts 90 days, so shaving a minute off buys
  // nothing, and treating it as expired early would force an unnecessary browser re-auth.
  // Asserted explicitly so nobody "fixes" the inconsistency by copying the access-token line.
  assert.equal(isRefreshExpired(validToken, 1_999_970), false, '30s before expiry: still valid');
  assert.equal(isRefreshExpired(validToken, 2_000_000), false, 'exactly at expiry: still valid');
  assert.equal(isRefreshExpired(validToken, 2_000_001), true);
});

test('a token can have a live refresh token and a dead access token', () => {
  // The state that drives the silent-refresh path in session.ts. If both helpers ever agree
  // here, that path becomes unreachable and every expiry turns into a browser round trip.
  const now = 1_500_000;

  assert.equal(isAccessExpired(validToken, now), true);
  assert.equal(isRefreshExpired(validToken, now), false);
});

// --- persistence ----------------------------------------------------------------------------

test('writeTokens then readTokens round-trips every field', async () => {
  await writeTokens(validToken);

  assert.deepEqual(await readTokens(), validToken);
});

test('writeTokens creates the config directory when it does not exist', async () => {
  // First run on a fresh machine. An earlier version assumed the directory existed and failed
  // with ENOENT before a single token could be stored.
  await writeTokens(validToken);

  assert.ok((await stat(TOKENS_DIR)).isDirectory());
});

test('writeTokens overwrites an existing token file rather than appending', async () => {
  const refreshed: Token = { ...validToken, access_token: 'access-second', expires_at_seconds: 1_003_600 };

  await writeTokens(validToken);
  await writeTokens(refreshed);

  assert.deepEqual(await readTokens(), refreshed);
});

test('writeTokens leaves no temporary file behind', async () => {
  // The write goes to a temp file and is renamed into place, so a crash mid-write cannot leave
  // a half-written tokens.json. The rename is also what stops the temp file accumulating.
  await writeTokens(validToken);

  assert.deepEqual(await readdir(TOKENS_DIR), ['tokens.json']);
});

test('the token file is owner-only and so is its directory', async () => {
  // tokens.json holds a 90-day credential. This regresses silently — nothing fails, the file is
  // just readable by every user on the machine — so it is asserted rather than eyeballed.
  await writeTokens(validToken);

  assert.equal(await modeOf(TOKENS_PATH), 0o600);
  assert.equal(await modeOf(TOKENS_DIR), 0o700);
});

test('clearTokens removes the file', async () => {
  await writeTokens(validToken);
  await clearTokens();

  assert.equal(await readTokens(), null);
});

test('clearTokens on an absent file resolves instead of throwing', async () => {
  // Called on logout and on an unrecoverable auth failure, both of which can happen when no
  // token was ever stored. The ENOENT swallow is deliberate.
  await assert.doesNotReject(clearTokens());
});

// --- corrupt and missing files ---------------------------------------------------------------
// readTokens returns null rather than throwing so that a damaged token file costs the user one
// re-auth instead of a server that will not start. Each case asserts both halves: null, and no
// throw.

test('readTokens returns null when the file has never been written', async () => {
  assert.equal(await readTokens(), null);
});

test('readTokens returns null for an empty file', async () => {
  await writeRaw('');

  assert.equal(await readTokens(), null);
});

test('readTokens returns null for malformed JSON', async () => {
  await writeRaw('{"access_token": "abc"');

  assert.equal(await readTokens(), null);
});

test('readTokens returns null for valid JSON of the wrong shape', async () => {
  await writeRaw(JSON.stringify({ hello: 'world' }));

  assert.equal(await readTokens(), null);
});

test('readTokens returns null when a required field is missing', async () => {
  await writeRaw(
    JSON.stringify({
      access_token: validToken.access_token,
      expires_at_seconds: validToken.expires_at_seconds,
      refresh_expires_at_seconds: validToken.refresh_expires_at_seconds,
      membership_id: validToken.membership_id,
    }),
  );

  assert.equal(await readTokens(), null);
});

test('readTokens returns null when a field has the wrong type', async () => {
  // The expiry arriving as a string is the realistic version of this: it survives JSON.parse
  // and then makes every arithmetic comparison in the expiry helpers nonsense.
  await writeRaw(JSON.stringify({ ...validToken, expires_at_seconds: '1000000' }));

  assert.equal(await readTokens(), null);
});

test('a corrupt file never throws, whatever shape it takes', async () => {
  const corruptions = ['', '   ', 'null', '[]', '"a string"', '{', '{"access_token": 5}'];

  for (const contents of corruptions) {
    await writeRaw(contents);
    await assert.doesNotReject(readTokens(), `threw on ${JSON.stringify(contents)}`);
  }
});
