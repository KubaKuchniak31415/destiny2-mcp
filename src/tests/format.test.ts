import test from 'node:test';
import assert from 'node:assert/strict';

import { formatWeapon, formatPerkColumn, formatWeaponDescription } from '../format.ts';
import type { Weapon, Perk } from '../types.ts';

// These functions are pure string builders, so the fixtures are hand-written rather than
// pulled from the index. Perk hashes are arbitrary: the formatter reads only `name`, and a
// fixture carrying more than the function touches invites tests that pass for the wrong
// reason. Names and column shapes are real, taken from the built index — Bad Juju and
// Deadlock both carry five perk columns, which is the case that used to be dropped.
const perk = (name: string): Perk => ({ hash: 1, name, isEnhanced: false });

const badJuju: Weapon = {
  hash: 2816212794,
  name: 'Bad Juju',
  type: 'Pulse Rifle',
  tierType: 6,
};

const badJujuPerks = new Map<number, Perk[]>([
  [0, [perk('Hammer-Forged Rifling')]],
  [1, [perk('Steady Rounds')]],
  [2, [perk('Hip-Fire Grip')]],
  [3, [perk('Short-Action Stock')]],
  [4, [perk('Full Auto Trigger System')]],
]);

test('formatWeapon names the tier rather than leaking the raw number', () => {
  assert.equal(formatWeapon(badJuju), 'Bad Juju - Pulse Rifle (Tier: Exotic)');
  assert.equal(
    formatWeapon({ hash: 1, name: 'Deadlock', type: 'Shotgun', tierType: 5 }),
    'Deadlock - Shotgun (Tier: Purple)',
  );
});

test('formatWeapon falls back to Unknown for null, zero and unmapped tiers', () => {
  // tierType is nullable in the schema, 0 is a real tierType that is also falsy, and Bungie
  // can add values we have no name for. All three converge on the same output, which is why
  // the early return in formatWeapon is currently invisible — it is covered here so that
  // simplifying it away cannot change behaviour unnoticed.
  const base = { hash: 1, name: 'Nameless Midnight', type: 'Scout Rifle' };

  assert.equal(formatWeapon({ ...base, tierType: null }), 'Nameless Midnight - Scout Rifle (Tier: Unknown)');
  assert.equal(formatWeapon({ ...base, tierType: 0 }), 'Nameless Midnight - Scout Rifle (Tier: Unknown)');
  assert.equal(formatWeapon({ ...base, tierType: 99 }), 'Nameless Midnight - Scout Rifle (Tier: Unknown)');
});

test('formatPerkColumn numbers columns from 1, not from the stored index', () => {
  // column_index is stored 0-based, but players count perk columns 1-4. Printing the raw
  // index made the model report "Column 0" to users.
  assert.equal(
    formatPerkColumn({ columnIndex: 0, perks: [perk('Outlaw'), perk('Rampage')] }),
    'Column 1: Outlaw, Rampage',
  );
  assert.equal(
    formatPerkColumn({ columnIndex: 4, perks: [perk('Full Auto Trigger System')] }),
    'Column 5: Full Auto Trigger System',
  );
});

test('formatWeaponDescription emits exactly the expected string, whitespace included', () => {
  // The point of this test. A multi-line template literal previously indented the first perk
  // column but not the rest, doubled every newline and left a trailing "\n  ". None of that is
  // visible when eyeballing terminal output, and all of it is tokens sent on every tool call.
  assert.equal(
    formatWeaponDescription(badJuju, badJujuPerks),
    'Bad Juju - Pulse Rifle (Tier: Exotic)\n' +
      '\n' +
      'Possible perks (one per column rolls):\n' +
      'Column 1: Hammer-Forged Rifling\n' +
      'Column 2: Steady Rounds\n' +
      'Column 3: Hip-Fire Grip\n' +
      'Column 4: Short-Action Stock\n' +
      'Column 5: Full Auto Trigger System',
  );
});

test('formatWeaponDescription neither leads nor trails with whitespace', () => {
  // Asserted separately from the exact-string test so a future rewording of the body still
  // fails loudly if the padding comes back.
  const output = formatWeaponDescription(badJuju, badJujuPerks);

  assert.equal(output, output.trim());
});

test('every column survives, including the fifth', () => {
  // 21 weapons in the index carry a fifth perk column. getWeaponPerks used to build a fixed
  // array of four and skip column_index >= 4, silently dropping Bad Juju's Full Auto Trigger
  // System and Deadlock's four stock perks. The formatter must not reintroduce a cap.
  const lines = formatWeaponDescription(badJuju, badJujuPerks).split('\n');
  const columns = lines.filter((line) => line.startsWith('Column '));

  assert.equal(columns.length, 5);
  assert.ok(columns[4]?.includes('Full Auto Trigger System'), 'fifth column was dropped');
});

test('the perk pool is labelled as possible rolls, not as the roll', () => {
  // The index stores what a weapon *can* roll. The actual roll on a player's copy is instance
  // data from the inventory API. Without this label a model will present the pool as the
  // user's roll, which is the most damaging thing this formatter could get wrong.
  assert.match(formatWeaponDescription(badJuju, badJujuPerks), /Possible perks/);
});

test('a weapon with no perk columns still prints its header line', () => {
  // 2 of the 2208 weapons in the index have no perk rows at all. Documents current behaviour:
  // the "Possible perks" header is emitted with nothing beneath it and a trailing newline.
  assert.equal(
    formatWeaponDescription(badJuju, new Map()),
    'Bad Juju - Pulse Rifle (Tier: Exotic)\n\nPossible perks (one per column rolls):\n',
  );
});
