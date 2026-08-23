import test from 'node:test';
import assert from 'node:assert/strict';

import { formatWeapon, formatPerkColumn, formatWeaponDescription, formatItem } from '../format.ts';
import type { Weapon, Perk, ResolvedWeapon, ResolvedArmour } from '../types.ts';

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
    'Deadlock - Shotgun (Tier: Legendary)',
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


// ---------------------------------------------------------------------------
// formatItem
//
// One line per item, pipe-separated, positional. Every field the model needs to
// act on has to survive into that line, and the assertions below are whole-string
// rather than `.includes` on purpose: the line is an interface, the model parses
// it by position, and a stray space or a reordered column is exactly the kind of
// regression that stays invisible under a substring check.
//
// Fixtures are real items off a live account (see the step 6 probes), because the
// awkward cases here are all real: power 10 after the power reset, a negative
// armour stat, and a hyphen inside an item name.

const instanceId = '6917530020834823037';

const lostSignal: ResolvedWeapon = {
  kind: 'weapon',
  itemHash: 1197771438,
  itemInstanceId: instanceId,
  name: 'Lost Signal',
  type: 'Grenade Launcher',
  rarity: 5,
  rarityName: 'Legendary',
  slot: 'Kinetic Weapons',
  location: 'Titan',
  equipped: false,
  power: 504,
  element: 'Stasis',
};

const cogburn: ResolvedArmour = {
  kind: 'armour',
  itemHash: 2431571592,
  itemInstanceId: instanceId,
  name: 'TM-Cogburn Custom Cover',
  type: 'Helmet',
  rarity: 5,
  rarityName: 'Legendary',
  slot: 'Helmet',
  location: 'Titan',
  equipped: true,
  power: 516,
  classType: 'Titan',
  stats: { health: -5, melee: 0, grenade: 25, super: 30, class: 0, weapons: 30 },
};

test('formatItem prints a weapon with its element and slot', () => {
  assert.equal(
    formatItem(lostSignal),
    'Lost Signal | Legendary Stasis Grenade Launcher (Kinetic Slot) | 504 | Titan | 6917530020834823037',
  );
});

test('formatItem prints armour with all six stats in display order', () => {
  // The stat block is positional — H/M/G/S/C/W with no labels — so the order is
  // load-bearing and comes from the literal in gearResolver, not from anything
  // the formatter enforces. If that literal is ever reordered this is the test
  // that catches it.
  assert.equal(
    formatItem(cogburn),
    'TM-Cogburn Custom Cover | Legendary Titan Helmet | 516 | Titan (Equipped) | H-5/M0/G25/S30/C0/W30 | 6917530020834823037',
  );
});

test('formatItem marks equipped items and leaves the rest unmarked', () => {
  // "what is my Hunter wearing" depends entirely on this marker: 17 of the ~1466
  // items are equipped and nothing else in the line distinguishes them.
  assert.match(formatItem(cogburn), / \| Titan \(Equipped\) \| /);
  assert.match(formatItem({ ...cogburn, equipped: false }), / \| Titan \| /);
  assert.doesNotMatch(formatItem(lostSignal), /Equipped/);
});

test('formatItem prints power 10 as a number rather than hiding it', () => {
  // Power was reset, so ~430 vault items legitimately sit at power 10. They are
  // real items and the number is real — suppressing either would silently drop a
  // third of the vault from every listing.
  const stoicism: ResolvedArmour = {
    ...cogburn,
    name: 'Stoicism',
    type: 'Titan Mark',
    slot: 'Class Armor',
    rarity: 6,
    rarityName: 'Exotic',
    location: 'Vault',
    equipped: false,
    power: 10,
    stats: { health: 20, melee: 25, grenade: 2, super: 30, class: 2, weapons: 2 },
  };

  assert.equal(
    formatItem(stoicism),
    'Stoicism | Exotic Titan Titan Mark | 10 | Vault | H20/M25/G2/S30/C2/W2 | 6917530020834823037',
  );
});

test('formatItem renders missing power as ? rather than inventing a number', () => {
  // power is optional because primaryStat can be absent. Falling back to a
  // plausible-looking number would be indistinguishable from a real power-10
  // item, of which there are hundreds, and the model would report it as fact.
  const noPower: ResolvedWeapon = { ...lostSignal };
  delete noPower.power;

  assert.equal(
    formatItem(noPower),
    'Lost Signal | Legendary Stasis Grenade Launcher (Kinetic Slot) | ? | Titan | 6917530020834823037',
  );
});

test('formatItem keeps negative armour stats', () => {
  // Armour 3.0 tunings produce genuinely negative values — the live helmet above
  // has health -5. Clamping at zero or dropping the sign would misreport a build.
  assert.match(formatItem(cogburn), /H-5\//);
});

test('formatItem separators survive a hyphen inside an item name', () => {
  // The separator was ' - ' before this; Destiny names carry hyphens freely
  // (TM-Cogburn, Wish-Ender, Jack-o-Lantern), which made the columns ambiguous
  // to anything splitting the line. Splitting on the pipe must yield the same
  // column count whatever the name contains.
  assert.equal(formatItem(cogburn).split(' | ').length, 6);
  assert.equal(formatItem({ ...cogburn, name: 'Wish-Ender' }).split(' | ').length, 6);
});

test('formatItem emits the instance id, unlabelled and last', () => {
  // The instance id is the only thing that names one specific copy — five
  // Fatebringers share a name, a type and a power. A transfer tool cannot be
  // called without it, so it has to reach the model in the listing itself.
  for (const item of [lostSignal, cogburn]) {
    assert.ok(formatItem(item).endsWith(` | ${instanceId}`));
  }
});

test('formatItem gives weapons one fewer column than armour', () => {
  // Weapons carry no stat block, so the two kinds are not the same shape. This is
  // deliberate, but it means the header line in the tool layer cannot describe
  // both with one set of column names — asserted here so the difference is a
  // decision rather than a surprise.
  assert.equal(formatItem(lostSignal).split(' | ').length, 5);
  assert.equal(formatItem(cogburn).split(' | ').length, 6);
});
