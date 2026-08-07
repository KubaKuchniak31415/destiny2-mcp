import test from 'node:test';
import assert from 'node:assert/strict';

import { toDbId, toHash, type DbId } from '../utilities/hash.ts';

// Bungie's manifest hashes are unsigned 32-bit; the SQLite manifest stores them
// as signed 32-bit primary keys.
const CASES: ReadonlyArray<{ hash: number; dbId: number; why: string }> = [
  { hash: 0, dbId: 0, why: 'trivial' },
  { hash: 0x7fffffff, dbId: 2147483647, why: 'last value that must not change' },
  { hash: 0x80000000, dbId: -2147483648, why: 'first value that must change' },
  { hash: 2147583688, dbId: -2147383608, why: 'the real, verified pair' },
  { hash: 0xffffffff, dbId: -1, why: 'top of the range' },
];

for (const { hash, dbId, why } of CASES) {
  test(`toDbId(${hash}) === ${dbId} — ${why}`, () => {
    assert.equal(toDbId(hash), dbId);
  });

  test(`toHash(${dbId}) === ${hash} — ${why}`, () => {
    assert.equal(toHash(dbId as DbId), hash);
  });
}

// The pair that catches an off-by-one in the comparison: `>=` instead of `>`
// passes every other case in the table, because 0x7FFFFFFF is the only hash
// where the two operators disagree.
test('0x7FFFFFFF stays positive and 0x80000000 is the first to wrap', () => {
  assert.equal(toDbId(0x7fffffff), 2147483647, '0x7FFFFFFF must not change');
  assert.equal(toDbId(0x80000000), -2147483648, '0x80000000 must change');
});

test('toHash reverses toDbId for every case', () => {
  for (const { hash } of CASES) {
    assert.equal(toHash(toDbId(hash)), hash, `round trip failed for ${hash}`);
  }
});
