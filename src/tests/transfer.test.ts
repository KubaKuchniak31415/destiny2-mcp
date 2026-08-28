import test from 'node:test';
import assert from 'node:assert/strict';

import { pickEviction, planRoute, pickReplacement, resolveDestination, translateErrorCode } from '../transfer.ts';
import type { Leg } from '../transfer.ts';
import type {
  ArmourStats, Profile, ResolvedArmour, ResolvedWeapon,
} from '../types.ts';

// planRoute, resolveDestination and pickReplacement are pure, so the fixtures are hand-built
// rather than pulled from a live profile. Ids are 19 digits because every int64 in Bungie's
// schema arrives as a string, and a fixture using short ids would let a stray Number() pass.
const TITAN   = '2305843009301545016';
const HUNTER  = '2305843009301545017';
const WARLOCK = '2305843009301545018';

const NO_STATS: ArmourStats = {
  health: 0, melee: 0, grenade: 0, super: 0, class: 0, weapons: 0,
};

// Built by string concatenation, not by incrementing a number: 19-digit ids exceed 2^53, so
// ++ on a numeric literal silently returns the same value every time and every fixture ends
// up sharing one instance id. Same trap the schema avoids by typing these as z.string().
let idCounter = 0;
const freshId = (): string => `69175290276419810${String(idCounter++).padStart(2, '0')}`;

const weapon = (over: Partial<ResolvedWeapon> = {}): ResolvedWeapon => ({
  kind: 'weapon',
  itemHash: 2171478765,
  itemInstanceId: freshId(),
  name: 'Fatebringer',
  type: 'Hand Cannon',
  rarity: 5,
  rarityName: 'Legendary',
  slot: 'Kinetic Weapons',
  location: 'Vault',
  equipped: false,
  inPostmaster: false,
  element: 'Kinetic',
  ...over,
});

const armour = (over: Partial<ResolvedArmour> = {}): ResolvedArmour => ({
  kind: 'armour',
  itemHash: 1116939341,
  itemInstanceId: freshId(),
  name: 'Wildwood Helm',
  type: 'Helmet',
  rarity: 5,
  rarityName: 'Legendary',
  slot: 'Helmet',
  location: 'Vault',
  equipped: false,
  inPostmaster: false,
  classType: 'Hunter',
  stats: NO_STATS,
  ...over,
});

// resolveDestination reads only profile.characters.data, but Profile is the full parsed
// shape. Building it honestly rather than casting keeps the fixture compiling if the schema
// grows a component, which is exactly when a cast would start hiding a real break.
const makeProfile = (classes: Record<string, string>): Profile => ({
  characters: {
    privacy: 2,
    data: Object.fromEntries(
      Object.entries(classes).map(([characterId, classType]) => [
        characterId,
        { characterId, classType, light: 2000, dateLastPlayed: new Date(0) },
      ]),
    ),
  },
  characterInventories: { privacy: 2 },
  characterEquipment:   { privacy: 1 },
  profileInventory:     { privacy: 2 },
  itemComponents: {
    instances:     { privacy: 2 },
    stats:         { privacy: 2 },
    sockets:       { privacy: 2 },
    reusablePlugs: { privacy: 2 },
  },
});

const oneOfEach = makeProfile({ [TITAN]: 'Titan', [HUNTER]: 'Hunter', [WARLOCK]: 'Warlock' });


// ---------------------------------------------------------------- resolveDestination

test('resolveDestination maps a class name to that character id', () => {
  assert.equal(resolveDestination(oneOfEach, 'Titan'), TITAN);
  assert.equal(resolveDestination(oneOfEach, 'Hunter'), HUNTER);
  assert.equal(resolveDestination(oneOfEach, 'Warlock'), WARLOCK);
});

test('resolveDestination passes Vault through without touching the profile', () => {
  // Vault is not a character, so it must short-circuit before the lookup — otherwise an
  // account with no characters parsed would fail a move to the vault.
  assert.equal(resolveDestination(makeProfile({}), 'Vault'), 'Vault');
});

test('resolveDestination throws rather than guessing when two characters share a class', () => {
  // The relation is one-to-many: building a class -> id map instead would silently keep
  // whichever Hunter was written last, and move the item to an arbitrary one of the two.
  const twoHunters = makeProfile({ [HUNTER]: 'Hunter', [WARLOCK]: 'Hunter' });
  assert.throws(() => resolveDestination(twoHunters, 'Hunter'), /2 Hunter/);
});

test('resolveDestination throws when the class is absent or characters are missing', () => {
  assert.throws(() => resolveDestination(makeProfile({ [TITAN]: 'Titan' }), 'Warlock'), /no Warlock/);
  assert.throws(() => resolveDestination({ ...oneOfEach, characters: { privacy: 2 } }, 'Titan'), /no Titan/);
});


// ---------------------------------------------------------------- planRoute

test('planRoute moves an item out of the vault in a single leg', () => {
  const item = weapon();
  assert.deepEqual(planRoute(item, TITAN, {}), [
    { kind: 'fromVault', itemId: item.itemInstanceId, itemHash: item.itemHash, to: TITAN },
  ] satisfies Leg[]);
});

test('planRoute moves an item off a character in a single leg', () => {
  const item = weapon({ characterId: HUNTER, location: 'Hunter' });
  assert.deepEqual(planRoute(item, 'Vault', {}), [
    { kind: 'toVault', itemId: item.itemInstanceId, itemHash: item.itemHash, from: HUNTER },
  ] satisfies Leg[]);
});

test('planRoute routes character to character through the vault, in order', () => {
  // There is no character-to-character endpoint. Both legs are required and the order is
  // load-bearing: a reversed pair would try to pull an item the vault does not hold yet.
  const item = weapon({ characterId: HUNTER, location: 'Hunter' });
  assert.deepEqual(planRoute(item, TITAN, {}), [
    { kind: 'toVault',   itemId: item.itemInstanceId, itemHash: item.itemHash, from: HUNTER },
    { kind: 'fromVault', itemId: item.itemInstanceId, itemHash: item.itemHash, to: TITAN },
  ] satisfies Leg[]);
});

test('planRoute pulls from the postmaster onto the owning character and stops there', () => {
  const item = weapon({ characterId: HUNTER, location: 'Hunter', inPostmaster: true });
  assert.deepEqual(planRoute(item, HUNTER, {}), [
    { kind: 'pullFromPostmaster', itemId: item.itemInstanceId, itemHash: item.itemHash, characterId: HUNTER },
  ] satisfies Leg[]);
});

test('planRoute pulls from the postmaster before transferring anywhere else', () => {
  const item = weapon({ characterId: HUNTER, location: 'Hunter', inPostmaster: true });

  assert.deepEqual(planRoute(item, 'Vault', {}), [
    { kind: 'pullFromPostmaster', itemId: item.itemInstanceId, itemHash: item.itemHash, characterId: HUNTER },
    { kind: 'toVault',            itemId: item.itemInstanceId, itemHash: item.itemHash, from: HUNTER },
  ] satisfies Leg[]);

  assert.deepEqual(planRoute(item, TITAN, {}), [
    { kind: 'pullFromPostmaster', itemId: item.itemInstanceId, itemHash: item.itemHash, characterId: HUNTER },
    { kind: 'toVault',            itemId: item.itemInstanceId, itemHash: item.itemHash, from: HUNTER },
    { kind: 'fromVault',          itemId: item.itemInstanceId, itemHash: item.itemHash, to: TITAN },
  ] satisfies Leg[]);
});

test('planRoute equips the replacement, not the item being moved, to free an equipped slot', () => {
  // The displacement leg carries the replacement's instance id. Using the moved item's id
  // here is a no-op equip followed by 1656 CannotPerformActionOnEquippedItem on the transfer.
  const item = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const replacement = weapon({ characterId: HUNTER, location: 'Hunter', name: 'Lost Signal' });

  assert.deepEqual(planRoute(item, TITAN, { replacement }), [
    { kind: 'equip',     itemId: replacement.itemInstanceId, characterId: HUNTER, reason: 'displace' },
    { kind: 'toVault',   itemId: item.itemInstanceId, itemHash: item.itemHash, from: HUNTER },
    { kind: 'fromVault', itemId: item.itemInstanceId, itemHash: item.itemHash, to: TITAN },
  ] satisfies Leg[]);
});

test('planRoute does not invent a displacement when no replacement is supplied', () => {
  // Choosing the replacement needs the whole item list, so it stays the caller's job. The
  // route is deliberately the one that will fail with 1656 rather than a silently wrong one.
  const item = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  assert.deepEqual(planRoute(item, TITAN, {}).map(l => l.kind), ['toVault', 'fromVault']);
});

test('planRoute appends the arrival equip on the destination character', () => {
  // The headline case: vault -> character with equip. The equip must target the destination,
  // and must still be emitted when the item never left the vault before now.
  const item = weapon();
  assert.deepEqual(planRoute(item, TITAN, { equip: true }), [
    { kind: 'fromVault', itemId: item.itemInstanceId, itemHash: item.itemHash, to: TITAN },
    { kind: 'equip',     itemId: item.itemInstanceId, characterId: TITAN, reason: 'arrive' },
  ] satisfies Leg[]);
});

test('planRoute emits no legs when the item is already at the destination', () => {
  const onTitan = weapon({ characterId: TITAN, location: 'Titan' });
  assert.deepEqual(planRoute(onTitan, TITAN, {}), []);

  const inVault = weapon();
  assert.deepEqual(planRoute(inVault, 'Vault', {}), []);
});

test('planRoute still equips an item that is already on the destination', () => {
  // The no-op check is structural — it suppresses the transfer legs only. Returning [] here
  // would report "already there" and silently drop the equip the user asked for.
  const item = weapon({ characterId: TITAN, location: 'Titan' });
  assert.deepEqual(planRoute(item, TITAN, { equip: true }), [
    { kind: 'equip', itemId: item.itemInstanceId, characterId: TITAN, reason: 'arrive' },
  ] satisfies Leg[]);
});

test('planRoute ignores equip when the destination is the vault', () => {
  const item = weapon({ characterId: TITAN, location: 'Titan' });
  assert.deepEqual(planRoute(item, 'Vault', { equip: true }), [
    { kind: 'toVault', itemId: item.itemInstanceId, itemHash: item.itemHash, from: TITAN },
  ] satisfies Leg[]);
});


// ---------------------------------------------------------------- pickReplacement

test('pickReplacement prefers a lower-power legendary over a higher-power exotic', () => {
  // Equipping a second exotic is the one predictable route to 1641 UniqueEquipRestricted,
  // so NonExotic has to outrank Power rather than tie-break it.
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true, power: 2000 });
  const exotic    = weapon({ characterId: HUNTER, location: 'Hunter', power: 2010, rarity: 6, rarityName: 'Exotic', name: 'Sunshot' });
  const legendary = weapon({ characterId: HUNTER, location: 'Hunter', power: 1900, name: 'Lost Signal' });

  assert.equal(pickReplacement([displaced, exotic, legendary], displaced), legendary);
});

test('pickReplacement takes the highest-power candidate among equals', () => {
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const low  = weapon({ characterId: HUNTER, location: 'Hunter', power: 1900 });
  const high = weapon({ characterId: HUNTER, location: 'Hunter', power: 2000 });

  assert.equal(pickReplacement([displaced, low, high], displaced), high);
});

test('pickReplacement never returns an equipped, postmaster or wrong-slot item', () => {
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const alsoEquipped = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true, slot: 'Kinetic Weapons' });
  const inPostmaster = weapon({ characterId: HUNTER, location: 'Hunter', inPostmaster: true });
  const wrongSlot    = weapon({ characterId: HUNTER, location: 'Hunter', slot: 'Power Weapons' });

  assert.equal(pickReplacement([displaced, alsoEquipped, inPostmaster, wrongSlot], displaced), undefined);
});

test('pickReplacement scopes to the character id, not the class name', () => {
  // location is the class name the formatter prints, and two characters can share one. Only
  // characterId identifies the guardian the item actually has to be equipped on.
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const otherHunter = weapon({ characterId: WARLOCK, location: 'Hunter' });

  assert.equal(pickReplacement([displaced, otherHunter], displaced), undefined);
});

test('pickReplacement matches armour class, accepting Any but not another class', () => {
  const displaced = armour({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const titanHelm = armour({ characterId: HUNTER, location: 'Hunter', classType: 'Titan', name: 'Titan Helm' });
  const anyHelm   = armour({ characterId: HUNTER, location: 'Hunter', classType: 'Any', name: 'Any Helm' });

  assert.equal(pickReplacement([displaced, titanHelm], displaced), undefined);
  assert.equal(pickReplacement([displaced, titanHelm, anyHelm], displaced), anyHelm);
});

test('pickReplacement searches the vault when asked, and only then', () => {
  // The fallback for a character with no spare in that slot. Without it the equipped-source
  // case dead-ends on a guardian carrying exactly one weapon of a kind.
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  const inVault = weapon({ name: 'Lost Signal' });

  assert.equal(pickReplacement([displaced, inVault], displaced), undefined);
  assert.equal(pickReplacement([displaced, inVault], displaced, true), inVault);
});

test('pickReplacement returns undefined when nothing matches at all', () => {
  const displaced = weapon({ characterId: HUNTER, location: 'Hunter', equipped: true });
  assert.equal(pickReplacement([displaced], displaced), undefined);
  assert.equal(pickReplacement([], displaced), undefined);
});


// ---------------------------------------------------------------- translateErrorCode

test('translateErrorCode maps known codes and leaves unknown ones to the caller', () => {
  // An unmapped code must come back undefined rather than a placeholder, so the formatter
  // can fall through to Bungie's own ErrorStatus and Message instead of printing a guess.
  assert.equal(translateErrorCode(1642)?.name, 'DestinyNoRoomInDestination');
  assert.equal(translateErrorCode(1641)?.name, 'DestinyItemUniqueEquipRestricted');
  assert.equal(translateErrorCode(1699), undefined);
});


// ---------------------------------------------------------------- pickEviction

test('pickEviction sends the least valuable item in the slot to the vault', () => {
  const incoming = weapon({ slot: 'Kinetic Weapons' });
  const spare  = weapon({ characterId: TITAN, location: 'Titan', power: 2000, name: 'Spare' });
  const worst  = weapon({ characterId: TITAN, location: 'Titan', power: 1750, name: 'Worst' });

  assert.equal(pickEviction([incoming, spare, worst], TITAN, incoming), worst);
});

test('pickEviction keeps exotics even when they are the lowest power in the slot', () => {
  // NonExotic outranks LowPower, so a low-rolled exotic survives and a higher legendary goes.
  // Exotics are the items a player is least likely to want quietly relocated.
  const incoming = weapon();
  const exotic    = weapon({ characterId: TITAN, location: 'Titan', power: 1600, rarity: 6, rarityName: 'Exotic', name: 'Sunshot' });
  const legendary = weapon({ characterId: TITAN, location: 'Titan', power: 2000, name: 'Lost Signal' });

  assert.equal(pickEviction([incoming, exotic, legendary], TITAN, incoming), legendary);
});

test('pickEviction never evicts an equipped item', () => {
  // Equipped items cannot be transferred at all, so picking one turns a recoverable 1642 into
  // a 1656 on the eviction leg and leaves the original move stranded.
  const incoming = weapon();
  const equipped = weapon({ characterId: TITAN, location: 'Titan', equipped: true, power: 1500 });
  const spare    = weapon({ characterId: TITAN, location: 'Titan', power: 2000, name: 'Spare' });

  assert.equal(pickEviction([incoming, equipped, spare], TITAN, incoming), spare);
  assert.equal(pickEviction([incoming, equipped], TITAN, incoming), undefined);
});

test('pickEviction ignores the postmaster, other characters and other slots', () => {
  // Postmaster items do not occupy the bucket that is full, and slot is the item definition's
  // bucket rather than where the copy currently sits, so both need excluding explicitly.
  const incoming = weapon({ slot: 'Kinetic Weapons' });
  const inPostmaster = weapon({ characterId: TITAN, location: 'Titan', inPostmaster: true, power: 1000 });
  const otherCharacter = weapon({ characterId: HUNTER, location: 'Hunter', power: 1000 });
  const otherSlot = weapon({ characterId: TITAN, location: 'Titan', slot: 'Power Weapons', power: 1000 });
  const spare = weapon({ characterId: TITAN, location: 'Titan', power: 2000, name: 'Spare' });

  assert.equal(pickEviction([incoming, inPostmaster, otherCharacter, otherSlot, spare], TITAN, incoming), spare);
});

test('pickEviction returns undefined when the slot holds nothing movable', () => {
  // The dead end: the destination is full but everything in it is equipped or exotic-locked.
  // The handler has to report the original failure rather than retry into the same error.
  const incoming = weapon();
  assert.equal(pickEviction([incoming], TITAN, incoming), undefined);
});
