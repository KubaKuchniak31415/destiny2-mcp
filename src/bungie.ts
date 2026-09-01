import * as logger from './utilities/logger.ts';
import * as z from 'zod/v4';
import { config } from './config.ts';
import { envelopeSchema, manifestSchema, membershipSchema, profileSchema } from './types.ts';
import type { Manifest, Profile} from './types.ts'
import { getAccessToken, ReauthRequired } from './auth/session.ts';

const BUNGIE_ROOT = 'https://www.bungie.net/Platform';

export class BungieError extends Error {
  errorCode: number;
  errorStatus: string;
  bungieMessage: string;
  throttleSeconds: number;

  constructor (msg: string, errorCode: number, errorStatus: string, bungieMessage: string, throttleSeconds: number, options: ErrorOptions = {}) {
    super(msg, options);
    this.errorCode = errorCode;
    this.errorStatus = errorStatus;
    this.bungieMessage = bungieMessage;
    this.throttleSeconds = throttleSeconds

    Object.setPrototypeOf(this, BungieError.prototype)
  }
}

const bungieFetch = async <T extends z.ZodType>(
  path: string, 
  schema: T,
  options?: {auth?: boolean; method?: string; body?: unknown}
): Promise<z.infer<T>> => {
  const headers = {
    'X-API-Key': config.apiKey,
    ...(options?.auth ? {Authorization: `Bearer ${(await getAccessToken()).access_token}`} : {}),
    ...(options?.body !== undefined ? {'Content-Type': 'application/json'} : {})
  };

  const response = await fetch(`${BUNGIE_ROOT}${path}`, {
    headers: headers,
    method: options?.method ?? 'GET',
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => undefined);

  const envelope = data === undefined ? undefined : envelopeSchema.safeParse(data);
  if (!envelope?.success) {
    if (!response.ok) {
      logger.print('error', `Error fetching ${path}: ${response.status} ${response.statusText}`)
      throw new Error(`Error fetching ${path}: ${response.status} ${response.statusText}`)
    }
    const detail = envelope ? z.prettifyError(envelope.error) : 'response body was not JSON'
    throw new Error(`Invalid response envelope for ${path}: ${detail}`);
  }

  const { ErrorCode, ErrorStatus, Message, ThrottleSeconds} = envelope.data;

  if (ErrorCode === 99) {
    logger.print('error', `Token has been invalidated`)
    throw new ReauthRequired('Token has been invalidated')
  }
  
  if (ErrorCode !== 1) {
    logger.print('error', `Error fetching ${path} ${ErrorCode} - ${ErrorStatus} - ${Message}`);
    throw new BungieError(`Error fetching ${path}`, ErrorCode, ErrorStatus, Message, ThrottleSeconds ?? 0);
  }

  const payload = schema.safeParse(envelope.data.Response);
  if (!payload.success) {
    logger.print('error', `Invalid response payload for ${path}: ${z.prettifyError(payload.error)}`);
    throw new Error(`Invalid response payload for ${path}: ${z.prettifyError(payload.error)}`);
  }

  return payload.data;
};

const Component = {
  ProfileInventories: 102,
  Characters: 200,
  CharacterInventories: 201,
  CharacterEquipment: 205,
  ItemInstances: 300,
  ItemStats: 304,
  ItemSockets: 305,
  ReusablePlugs: 310,
} as const;

const getProfile = async (
  membershipType: number,
  membershipId: string
): Promise<Profile> =>
  bungieFetch(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${Object.values(Component).join(',')}`,
    profileSchema,
    { auth: true }
  )

export const transferItem = async (
  membershipType: number,
  characterId: string,
  itemReferenceHash: number,
  itemId: string,
  transferToVault: boolean,
): Promise<{response: number}> => {
  const body = {
    itemReferenceHash,
    stackSize: 1,
    transferToVault,
    itemId,
    characterId,
    membershipType
  }
  const response = await bungieFetch(
    `/Destiny2/Actions/Items/TransferItem/`, z.number(), {auth: true, body, method: 'POST'}
  )

  return {response}
}

export const equipItem = async (
  membershipType: number,
  characterId: string,
  itemId: string
): Promise<{response: number}> => {
  const body = {
    membershipType,
    characterId,
    itemId,
  }

  const response = await bungieFetch(
    `/Destiny2/Actions/Items/EquipItem/`, z.number(), {auth: true, body, method: 'POST'}
  )

  return {response}
}

export const pullFromPostmaster = async (
  membershipType: number,
  characterId: string,
  itemId: string,
  itemReferenceHash: number,
): Promise<{response: number}> => {
  const body = {
    membershipType,
    characterId,
    itemId,
    itemReferenceHash
  }

  const response = await bungieFetch(
    `/Destiny2/Actions/Items/PullFromPostmaster/`, z.number(), {auth:true, body, method: 'POST'}
  )

  return {response}
}

const getMembershipData = async (): Promise<{membershipId: string, membershipType: number}> => {
  const {destinyMemberships, primaryMembershipId} = await bungieFetch('/User/GetMembershipsForCurrentUser', membershipSchema, {auth: true})

  const membership = primaryMembershipId
    ? destinyMemberships.find((m) => m.membershipId === primaryMembershipId)
    : destinyMemberships[0];

  if (!primaryMembershipId && destinyMemberships.length > 1) {
    logger.print('warn', `User has multiple memberships none of which seem to be primary.`)
  }

  if (!membership) throw new Error(`Couldn't find primary membership`)


  return {membershipId: membership.membershipId, membershipType: membership.membershipType}
}

const getManifest =  async (): Promise<Manifest> => 
  bungieFetch('/Destiny2/Manifest/', manifestSchema);


const getManifestVersion = async (): Promise<string> => {
  const manifest = await getManifest();
  return manifest.version;
};

const getManifestContentPath = async (): Promise<string> => {
  const manifest = await getManifest();
  const path = manifest.mobileWorldContentPaths.en;
  return path;
}

export {
  getManifestVersion,
  bungieFetch,
  getManifestContentPath,
  getManifest,
  getMembershipData,
  getProfile
};