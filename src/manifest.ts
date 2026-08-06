import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { getManifest } from "./bungie.ts";
import { extract } from "./unzip.ts";
import * as logger from "./utilities/logger.ts";

const BUNGIE_ROOT = 'https://www.bungie.net';

// Resolved from the module, not the cwd: MCP clients launch the server from
// wherever they happen to be.
const MANIFEST_DIR = join(import.meta.dirname, '..', 'manifest');
const STATE_PATH = join(MANIFEST_DIR, 'state.json');
const SIDECAR_PATH = join(MANIFEST_DIR, 'sidecar.sqlite')

type State = {
  version: string;
  database: string;
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

const readState = async (): Promise<State | null> => {
  try {
    return JSON.parse(await readFile(STATE_PATH, 'utf8')) as State;
  } catch {
    return null;
  }
};

const removeStaleFiles = async (keep: string): Promise<void> => {
  const entries = await readdir(MANIFEST_DIR);
  for (const entry of entries) {
    const keepPaths = [STATE_PATH, keep, SIDECAR_PATH];
    const path = join(MANIFEST_DIR, entry);
    if (keepPaths.includes(path)) {
      continue;
    }
    await unlink(path).catch(() => {});
  }
};

const ensureManifest = async (): Promise<string> => {
  await mkdir(MANIFEST_DIR, { recursive: true });

  const manifest = await getManifest();
  const { version } = manifest;

  const state = await readState();
  if (state?.version === version) {
    logger.print('info', `Manifest ${version} is already up to date`);
    return state.database;
  }

  logger.print('info', `Updating manifest to ${version}`);

  const archive = join(MANIFEST_DIR, `manifest-${version}.zip`);
  const database = join(MANIFEST_DIR, `world-${version}.sqlite`);

  await download(manifest.mobileWorldContentPaths.en, archive);
  await extract(archive, database);
  await unlink(archive).catch(() => {});

  await writeFile(STATE_PATH, JSON.stringify({ version, database } satisfies State, null, 2));
  await removeStaleFiles(database);

  return database;
};

export { download, ensureManifest };
