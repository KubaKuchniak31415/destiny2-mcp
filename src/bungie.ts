import * as logger from './utilities/logger.ts';
import * as z from 'zod/v4';
import BUNGIE_API_KEY from './config.ts';
import { envelopeSchema, manifestSchema, type Manifest } from './types.ts';

const BUNGIE_ROOT = 'https://www.bungie.net/Platform';

const bungieFetch = async <T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> => {
  const response = await fetch(`${BUNGIE_ROOT}${path}`, {
    headers: {
      'X-API-Key': BUNGIE_API_KEY,
    },
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
    logger.print('error', `Error fetching ${path}: ${ErrorCode} - ${ErrorStatus}`);
    throw new Error(`Error fetching ${path}: ${ErrorCode} - ${ErrorStatus}`);
  }

  const payload = schema.safeParse(envelope.data.Response);
  if (!payload.success) {
    logger.print('error', `Invalid response payload for ${path}: ${z.prettifyError(payload.error)}`);
    throw new Error(`Invalid response payload for ${path}: ${z.prettifyError(payload.error)}`);
  }

  return payload.data;
};



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

export {getManifestVersion, bungieFetch, getManifestContentPath, getManifest};