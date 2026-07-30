import { createWriteStream } from "node:fs";
import { rename, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import * as logger from "./utilities/logger.ts";

const download = async (url: string, dest: string): Promise<void> => {
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