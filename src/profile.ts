import { getMembershipData, getProfile } from "./bungie.ts";
import { getIndex } from "./db.ts";
import { characterNames, flattenProfile, gearResolver } from "./inventory.ts";
import type { Profile, ResolvedItem } from "./types.ts";



const TTL_MS = 30_000;
type Membership = {membershipId: string, membershipType: number}
let membership : Membership | undefined

export const getMembership = async (): Promise<Membership> => {
  membership ??= await getMembershipData()

  return membership
}

const makeProfile = async (): Promise<Profile>  => {
  if (membership === undefined) membership = await getMembershipData();

  const profileData = await getProfile(membership.membershipType, membership.membershipId);
  return profileData
}

let cached: {promise: Promise<Profile>, expires: number} | undefined;

export const getCachedProfile = (): Promise<Profile> => {
  if (cached === undefined || cached.expires < Date.now()) {
    const profileToCache = makeProfile().catch((err) => {
      if (profileToCache === cached?.promise) {
        invalidateProfile()
      }
      throw err; // Need to rethrow the error so callers dont get undefined
    })

    cached = {promise: profileToCache, expires: Date.now() + TTL_MS}
  }
  return cached.promise
}

export const invalidateProfile = () => {
  cached = undefined;
}


export const getResolvedItems = async (): Promise<ResolvedItem[]> => {
  const profileData = await getCachedProfile()
  const index = await getIndex()

  const charNames = characterNames(profileData);
  const flattened = flattenProfile(profileData);


  const resolvedItems = flattened.flatMap((l) => {
    const resolved = gearResolver(l, index, charNames)
    if (!resolved) return [];
    return resolved;
  })
  return resolvedItems
}