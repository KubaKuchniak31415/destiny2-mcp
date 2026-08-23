import * as logger from './utilities/logger.ts';
import * as z from 'zod/v4';
import { BUNGIE_API_KEY } from './config.ts';
import { envelopeSchema, manifestSchema, membershipSchema, profileSchema } from './types.ts';
import type { Manifest, Profile} from './types.ts'
import { getAccessToken } from './auth/session.ts';

const BUNGIE_ROOT = 'https://www.bungie.net/Platform';

const bungieFetch = async <T extends z.ZodType>(
  path: string, 
  schema: T,
  options?: {auth?: boolean; method?: string; body?: unknown}
): Promise<z.infer<T>> => {
  const headers = {
    'X-API-Key': BUNGIE_API_KEY,
    ...(options?.auth ? {Authorization: `Bearer ${(await getAccessToken()).access_token}`} : {}),
  };

  const response = await fetch(`${BUNGIE_ROOT}${path}`, {
    headers: headers,
    method: options?.method ?? 'GET',
    body: options?.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    logger.print('error', `Error fetching ${path}: ${response.status} ${response.statusText}`);
    throw new Error(`Error fetching ${path}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  const envelope = envelopeSchema.safeParse(data);
  if (!envelope.success) {
    logger.print('error', `Invalid response envelope for ${path}: ${z.prettifyError(envelope.error)}`);
    throw new Error(`Invalid response envelope for ${path}: ${z.prettifyError(envelope.error)}`);
  }

  const { ErrorCode, ErrorStatus, Message} = envelope.data;
  
  if (ErrorCode !== 1) {
    logger.print('error', `Error fetching ${path}: ${ErrorCode} - ${ErrorStatus} - ${Message}`);
    throw new Error(`Error fetching ${path}: ${ErrorCode} - ${ErrorStatus} - ${Message}`);
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

const getProfile = async(
  membershipType: number,
  membershipId: string
): Promise<Profile> =>
  bungieFetch(
    `/Destiny2/${membershipType}/Profile/${membershipId}/?components=${Object.values(Component).join(',')}`,
    profileSchema,
    { auth: true }
  )


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