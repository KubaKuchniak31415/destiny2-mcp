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
  inventory?: {tierType: number};
  plug?: {plugCategoryIdentifier: string};
  sockets?: {socketEntries: SocketEntry[]; socketCategories: SocketCategory[]};
  index: number;
}


export type Perk = {hash: number; name: string; isEnhanced: boolean}
export type PerkColumn = {columnIndex: number; perks: Perk[]}

export type Weapon = {hash: number; name: string; type: string; tierType: number | null}

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