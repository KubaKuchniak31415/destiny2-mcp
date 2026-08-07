import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { extractPerkColumns, createExtractStats } from '../weaponIndex.ts';
import type { ItemDef, PlugSetDef, Lookup } from '../weaponIndex.ts';

// Fatebringer 4184168210 from manifest 244213.26.06.29.2000-1-bnet.65583, plus the
// six plug sets its perk category points at and every plug item they reference.
//
// Trimmed to exactly the fields ItemDef and PlugSetDef declare — the full
// definitions are ~500 KB of icons, stats and localised strings that
// extractPerkColumns never reads. Those two types are the contract the function
// depends on, so a fixture cut to them fails loudly if it ever starts reaching
// for a field the type does not promise.
//
// socketEntries deliberately keeps its full original length: socketIndexes are
// positions into that array (Fatebringer's are 1,2,3,4,8,9), so a shortened one
// would shift every index and silently defeat the bounds check.
type Fixture = {
  weapon: ItemDef;
  plugSets: Record<string, PlugSetDef>;
  items: Record<string, ItemDef>;
};

const fixture = JSON.parse(
  // Resolved from the module, not the cwd: `node --test` runs from the repo root.
  readFileSync(new URL('./fatebringer.json', import.meta.url), 'utf8'),
) as Fixture;

// The whole point of keeping extractPerkColumns free of DatabaseSync: the real
// lookup and this one satisfy the same contract, so the test needs no 359 MB file.
const lookup: Lookup = {
  item: (hash) => fixture.items[hash] ?? null,
  plugSet: (hash) => fixture.plugSets[hash] ?? null,
};

const columns = extractPerkColumns(fixture.weapon, lookup);

const totals = (predicate: (isEnhanced: boolean) => boolean = () => true) =>
  columns.map((column) => column.perks.filter((perk) => predicate(perk.isEnhanced)).length);

test('drops the origin-trait and tracker sockets, leaving four real columns', () => {
  // The perk category lists six sockets — 1,2,3,4 are barrels/magazines/trait/trait,
  // 8 is the origin trait (Timelost Magazine) and 9 is the kill tracker. The latter
  // two empty out against EXCLUDED_PLUG_CATEGORIES and are dropped whole.
  assert.equal(columns.length, 4);
});

test('Fatebringer rolls 22/26/18/18 perks', () => {
  assert.deepEqual(totals(), [22, 26, 18, 18]);
});

test('each column is half base perks, except magazines', () => {
  assert.deepEqual(totals((isEnhanced) => !isEnhanced), [11, 14, 9, 9]);
  assert.deepEqual(totals((isEnhanced) => isEnhanced), [11, 12, 9, 9]);
});

test('column indexes are normalised to 0..3, not the raw socket indexes', () => {
  // Fatebringer's socketIndexes are 1,2,3,4,8,9 and differ per weapon, so the raw
  // values are meaningless as a column number. No count-based assertion can catch
  // this one — the totals above pass either way.
  assert.deepEqual(columns.map((column) => column.columnIndex), [0, 1, 2, 3]);
});

test('keeps both Drop Mag definitions — dedup is by hash, not by name', () => {
  // 4134353779 (index 4608) and 3678323611 (index 4609) are both named Drop Mag and
  // are identical in every meaningful field. 3678323611 sits in the slot the enhanced
  // Drop Mag would occupy in the plug set's base-run/enhanced-run ordering, so Bungie
  // emitted a clone of the base plug instead of authoring the enhanced one. This is a
  // manifest defect, not an extraction bug — light.gg renders the same duplicate, and
  // no enhancement signal (itemTypeDisplayName, tierType, tooltip style) flags either.
  //
  // It is why column 1 splits 14/12 rather than 13/13. Collapsing by name would make
  // that split even but cost the hash fidelity item matching needs, so this test fails
  // if anyone "fixes" it that way.
  const dropMags = columns[1]!.perks.filter((perk) => perk.name === 'Drop Mag');

  assert.equal(dropMags.length, 2);
  assert.deepEqual(
    dropMags.map((perk) => perk.hash).sort((a, b) => a - b),
    [3678323611, 4134353779],
  );
  assert.deepEqual(dropMags.map((perk) => perk.isEnhanced), [false, false]);
});

test('no tracker or origin-trait plugs survive the denylist', () => {
  const names = columns.flatMap((column) => column.perks.map((perk) => perk.name));

  assert.ok(!names.includes('Timelost Magazine'), 'origin trait leaked into a column');
  assert.ok(!names.some((name) => /Tracker$/.test(name)), 'kill tracker leaked into a column');
});

test('the only anomaly is the two columns the denylist emptied', () => {
  // Asserts *why* sockets 8 and 9 vanished — they resolved fine and emptied out — as
  // opposed to going missing because a plug set failed to resolve or a plug had no
  // name. The previous tests cannot tell those cases apart.
  const stats = createExtractStats();
  extractPerkColumns(fixture.weapon, lookup, stats);

  assert.deepEqual(stats, {
    noPerkCategory: 0,
    socketOutOfRange: 0,
    noPlugSet: 0,
    unresolvedPlugSet: 0,
    unresolvedPlug: 0,
    namelessPlug: 0,
    emptyColumn: 2,
    zeroColumns: 0,
  });
});
