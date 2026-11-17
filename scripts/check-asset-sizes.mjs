/**
 * Checks the built site's files against Cloudflare's limit of 25 MiB per static asset, so the build
 * fails instead of the deploy (`wrangler deploy` refuses to upload any file over it).
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Cloudflare Workers' biggest static asset, in bytes */
export const MAX_ASSET_SIZE = 25 * 1024 * 1024;

const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

/**
 * Throws, listing each file (by its path) over MAX_ASSET_SIZE, if any file in `dir` or its
 * subfolders is.
 * @param {string} dir the built site, e.g. "dist"
 */
export function assertAssetSizes(dir) {
  const tooBig = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .map((path) => ({ path, size: statSync(path).size }))
    .filter(({ size }) => size > MAX_ASSET_SIZE)
    .sort((a, b) => b.size - a.size);
  if (tooBig.length === 0) return;

  const list = tooBig.map(({ path, size }) => `  ${relative(".", path)} (${mib(size)})`).join("\n");
  throw new Error(
    `${tooBig.length === 1 ? "This file is" : "These files are"} over Cloudflare's ` +
      `${mib(MAX_ASSET_SIZE)} limit per file, so the site can't be deployed:\n${list}`,
  );
}
