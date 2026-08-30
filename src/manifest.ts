import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getManifest } from "./bungie.ts";
import { extract } from "./unzip.ts";
import * as logger from "./utilities/logger.ts";
import { buildWeaponIndex } from "./weaponIndex.ts";
import { CONFIG_DIR } from "./config.ts";

const BUNGIE_ROOT = 'https://www.bungie.net';
const INDEX_SCHEMA = 2;


const MANIFEST_DIR = join(CONFIG_DIR, 'manifest');

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const download = async (path: string, dest: string): Promise<void> => {
  const url = `${BUNGIE_ROOT}${path}`;
  const tmp = `${dest}.part`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }

  const total = Number(res.headers.get("content-length") || 0);

  if (total === 0) {
    throw new Error(`Content-Length header is missing or zero for ${url}`);
  }

  let downloaded = 0;
  let lastLoggedPercent = 0;

  if (!res.body) {
    throw new Error(`Response body is null for ${url}`);
  }

  const source = Readable.fromWeb(res.body);
  source.on("data", (chunk) => {
    downloaded += chunk.length;
    const percent = Math.floor((downloaded / total) * 100);
    if (percent >= lastLoggedPercent + 10) {
      logger.print("info", `Downloading manifest: ${percent}% (${downloaded}/${total} bytes)`);
      lastLoggedPercent = percent;
    }
  });

  try {
    await pipeline(source, createWriteStream(tmp));
    await rename(tmp, dest);
    logger.print("info", `Downloaded manifest to ${dest}`);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

const removeStaleFiles = async (keep: string[]): Promise<void> => {
  const entries = await readdir(MANIFEST_DIR);
  for (const entry of entries) {
    const path = join(MANIFEST_DIR, entry);
    if (keep.includes(path)) {
      continue;
    }
    await unlink(path).catch(() => {});
  }
};

const ensureManifest = async (): Promise<{ database: string; index: string }> => {
  await mkdir(MANIFEST_DIR, { recursive: true, mode: 0o700 });

  const manifest = await getManifest();
  const { version } = manifest;


  const database = join(MANIFEST_DIR, `world-${version}.sqlite`);
  const index = join(MANIFEST_DIR, `weapon-index-v${INDEX_SCHEMA}-${version}.sqlite`);

  if(!(await exists(database))) {
    const archive = join(MANIFEST_DIR, `world-${version}.zip`);
    await download(manifest.mobileWorldContentPaths.en, archive);
    await extract(archive, database);
    await unlink(archive).catch(() => {});
    logger.print('info', `Updated manifest to ${version}`);
  } else {
    logger.print('info', `Manifest up to date: ${version}`);
  }

  if (!(await exists(index))) {
    await buildWeaponIndex(index, database);
  } else {
    logger.print('info', `Weapon index up to date: ${version}`);
  }

  await removeStaleFiles([database, index]);

  return { database, index };
};

export { download, ensureManifest };
