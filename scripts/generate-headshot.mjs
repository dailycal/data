#!/usr/bin/env node
/**
 * Makes an author's picture from a photo of them: cuts them out of it onto the gray behind authors'
 * initials, crops it square and saves it as a small WebP, src/assets/authors/<slug>.webp
 * (replacing any picture they had), then sets `image:` in their src/content/authors/<slug>.mdx.
 * The steps and settings are shared with the editors' page, /editors/generate-headshot, in
 * src/lib/headshot.mjs.
 *
 * Usage:
 *   npm run generate-headshot -- <author> <photo>
 *
 * <author> is their name as in bylines ("Ji Yeon Woo") or their file's name ("ji-yeon-woo"). Their
 * author file has to exist already.
 *
 * See README.md's "Authors and the team".
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  HEADSHOT_SIZE,
  HEADSHOT_WEBP_QUALITY,
  cutOut,
  onBackgroundSquare,
} from "../src/lib/headshot.mjs";
import { checkExtension, formatBytes } from "../src/lib/image-optimization.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const authorsDir = path.join(root, "src/content/authors");
const picturesDir = path.join(root, "src/assets/authors");

/** "Ji Yeon Woo" -> "ji-yeon-woo", as authorSlug() in src/lib/authors.ts does. */
function authorSlug(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Sets (or adds, after `role:`) the `image:` line in an author file's frontmatter. */
function setImage(mdx, image) {
  const frontmatter = mdx.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) throw new Error("its frontmatter (between --- lines) wasn't found.");
  const line = `image: "${image}"`;
  let fields = frontmatter[1];
  if (/^#?\s*image:.*$/m.test(fields)) {
    // Replaces their picture, or one that's commented out
    fields = fields.replace(/^#?\s*image:.*$/m, line);
  } else if (/^role:.*$/m.test(fields)) {
    fields = fields.replace(/^role:.*$/m, (role) => `${role}\n${line}`);
  } else {
    fields += `\n${line}`;
  }
  return mdx.replace(frontmatter[0], `---\n${fields}\n---`);
}

async function main() {
  const [author, photo, ...rest] = process.argv.slice(2);
  if (!author || !photo || rest.length > 0) {
    throw new Error("Usage: npm run generate-headshot -- <author> <photo>");
  }

  const slug = authorSlug(author);
  const mdxPath = path.join(authorsDir, `${slug}.mdx`);
  if (!existsSync(mdxPath)) {
    throw new Error(
      `There's no author file src/content/authors/${slug}.mdx. Add one first (see README.md's ` +
        `"Authors and the team").`,
    );
  }
  const photoPath = path.resolve(photo);
  checkExtension(path.extname(photoPath).toLowerCase());
  const photoSize = (await stat(photoPath)).size;

  // Upright (by its EXIF orientation) and sRGB, as the browser draws it on the editors' page
  const { data, info } = await sharp(photoPath, { failOn: "none" })
    .rotate()
    .toColourspace("srgb")
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log(`Cutting the person out of ${photo}…`);
  const cutout = await cutOut(data, info.width, info.height, 3);
  const { pixels, size } = onBackgroundSquare(cutout, info.width, info.height);

  // The folder is empty, so not in git, until someone has a picture
  await mkdir(picturesDir, { recursive: true });
  const picture = path.join(picturesDir, `${slug}.webp`);
  await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
    .removeAlpha()
    .resize(HEADSHOT_SIZE, HEADSHOT_SIZE, { withoutEnlargement: true })
    .webp({ quality: HEADSHOT_WEBP_QUALITY, smartSubsample: true, effort: 6 })
    .toFile(picture);

  // Replace any picture they had before
  const old = path.join(picturesDir, `${slug}.jpg`);
  if (existsSync(old)) {
    await unlink(old);
    console.log(`Deleted their old picture, ${path.relative(root, old)}.`);
  }

  // Point their author file at it
  const mdx = await readFile(mdxPath, "utf8");
  await writeFile(mdxPath, setImage(mdx, `../../assets/authors/${slug}.webp`));

  const { width, height } = await sharp(picture).metadata();
  console.log(
    `\n${path.relative(root, picture)}: ${width}x${height}, ` +
      `${formatBytes((await stat(picture)).size)} (the photo was ${info.width}x${info.height}, ` +
      `${formatBytes(photoSize)})\nSet as ${slug}'s picture in ${path.relative(root, mdxPath)}.`,
  );
}

main().catch((err) => {
  console.error(`\ngenerate-headshot: ${err.message}`);
  process.exitCode = 1;
});
