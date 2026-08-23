import * as z from 'zod/v4';

export const envelopeSchema = z.object({
  ErrorCode: z.number(),
  ErrorStatus: z.string(),
  Message: z.string(),
  Response: z.unknown()
});

export const manifestSchema = z.object({
  version: z.string(),
  mobileWorldContentPaths: z.object({ en: z.string() })
});


export const membershipSchema = z.object({
  destinyMemberships: z.array(z.object({membershipId: z.string(), membershipType: z.int32()})),
  primaryMembershipId: z.string().optional()
})

export type Manifest = z.infer<typeof manifestSchema>;

// SocketEntries are the definitions of a specific socket on an item
// The randomized and reusable plugsets are essentially the perk pool for each socket say barrel, mag, perk1 and perk2
// A socket generally has one or the other never both i assume randomized is for rng rolls in perk1, perk2 and reusable is for mags etc.
type SocketEntry = {
  randomizedPlugSetHash?: number;
  reusablePlugSetHash?: number;
}

type SocketCategory = {socketCategoryHash: number; socketIndexes: number[]}

export type ItemDef = {
  hash: number;
  displayProperties: {name: string};
  itemTypeDisplayName?: string;
  inventory?: {tierType: number; bucketTypeHash?: number};
  classType?: number;
  plug?: {plugCategoryIdentifier: string};
  sockets?: {socketEntries: SocketEntry[]; socketCategories: SocketCategory[]};
  index: number;
}


export type Perk = {hash: number; name: string; isEnhanced: boolean; selected?: boolean}
export type PerkColumn = {columnIndex: number; perks: Perk[]}

export type Weapon = {hash: number; name: string; type: string; tierType: number | null}

// A row from the index's `gear` table: weapons and armour only, carrying the
// definition's home bucket so vault items can be classified.
export type Gear = Weapon & {bucketTypeHash: number; classType: number | null}

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  refresh_expires_in: z.number(),
  membership_id: z.string(),
});

export type TokenResponse = z.infer<typeof tokenResponseSchema>;

export const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at_seconds: z.number(),
  refresh_expires_at_seconds: z.number(),
  membership_id: z.string(),
});

export type Token = z.infer<typeof tokenSchema>;


export const characterSchema = z.object({
  characterId: z.string(),
  classType: z.int().transform(n => ['Titan','Hunter', 'Warlock'][n] ?? 'Unknown'),
  light: z.int(),
  dateLastPlayed: z.coerce.date(),
//  stats: statsSchema
});

export type Character = z.infer<typeof characterSchema>;

export const itemSchema = z.object({
  itemHash: z.int(),
  itemInstanceId: z.string().optional(),
  bucketHash: z.int(),
  location: z.int(),
  state: z.int()
})

export type Item = z.infer<typeof itemSchema>
export type InstancedItem = Item & { itemInstanceId: string };

export const isInstanced = (i: Item): i is InstancedItem =>
  i.itemInstanceId !== undefined;

export const instanceSchema = z.object({
  primaryStat: z.object({value: z.int()}).optional(),
  damageType: z.int().optional(),
})

export type Instance = z.infer<typeof instanceSchema>;

const single = <T extends z.ZodType>(inner: T) =>
  z.object({ data: inner.optional(), privacy: z.int() });

const dict = <T extends z.ZodType>(inner: T) =>
  z.object({ data: z.record(z.string(), inner).optional(), privacy: z.int() });

const inventorySchema = z.object({ items: z.array(itemSchema) });

const statsSchema = z.object({
  stats: z.record(z.string(), z.object({
    value: z.int()
  }))
})

const socketsSchema = z.object({
  sockets: z.array(z.object({
    plugHash: z.int().optional(),
    isEnabled: z.boolean(),
  }))
})

export type Sockets = z.infer<typeof socketsSchema>['sockets']

const reusablePlugsSchema = z.object({
  plugs: z.record(z.string(), z.array(z.object({
    plugItemHash: z.int(),
  })))
});

export type ReusablePlugs = z.infer<typeof reusablePlugsSchema>['plugs']

export type ItemStats = z.infer<typeof statsSchema>['stats']

export const profileSchema = z.object({
  characters:           dict(characterSchema),
  characterInventories: dict(inventorySchema),
  characterEquipment:   dict(inventorySchema),
  profileInventory:     single(inventorySchema),
  itemComponents: z.object({
    instances: dict(instanceSchema),   // keyed by itemInstanceId, not characterId
    stats: dict(statsSchema),
    sockets: dict(socketsSchema),
    reusablePlugs: dict(reusablePlugsSchema),
  }),
});

export type ResolvedBase = {
  itemHash: number;
  itemInstanceId: string;
  name: string;
  type: string;
  rarity: number;
  rarityName: string;
  slot: string;
  location: string;
  equipped: boolean;
  characterId?: string;
  power?: number
}

export type SetBonus = {
  twoPiece: string;
  fourPiece: string;
}

export type ArmourStats = {
  health: number;
  melee: number;
  grenade: number;
  super: number;
  class: number;
  weapons: number;
}

export type ClassType = 'Titan' | 'Hunter' | 'Warlock' | 'Any'
export type Element = 'Kinetic' | 'Solar' | 'Arc' | 'Void' | 'Stasis' | 'Strand' | 'None' | 'Raid'

export type ResolvedWeapon = ResolvedBase & { kind: 'weapon'; element: Element; rolledPerks?: PerkColumn[]}
export type ResolvedArmour = ResolvedBase & { kind: 'armour'; stats: ArmourStats; set?: SetBonus; classType: ClassType}

export type ResolvedItem = ResolvedWeapon | ResolvedArmour;

export type Profile = z.infer<typeof profileSchema>
