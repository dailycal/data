/**
 * Gives an interactive's pages the mobile app's background color (<meta name="mobile-accent-color">)
 * of the article that links to it, its `mobileAccentColor` frontmatter, at the end of `astro build`.
 * Doing it after the build covers the interactives copied in prebuilt (public/interactive/), which
 * shouldn't be edited by hand. Every other page gets the tag from src/components/Head.astro.
 *
 * An article linking to /interactive/<name>/... colors every page in that folder (e.g. the
 * election results' index.html and broadcast.html); one linking to /interactive/<page>, that page.
 */
import { globSync, readFileSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TAG = /<meta\s+name=["']mobile-accent-color["'][^>]*>/i;

/** Each article's interactive (`link` to /interactive/...) and `mobileAccentColor`, from its frontmatter. */
function interactives(directory = "src/content/articles") {
  const found = [];
  for (const file of globSync(`${directory}/**/*.mdx`)) {
    const frontmatter = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const field = (name) =>
      frontmatter.match(new RegExp(`^${name}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m"))?.[1];
    const link = field("link");
    const color = field("mobileAccentColor");
    // The content schema (src/content.config.ts) requires and validates the color
    if (link?.startsWith("/interactive/") && color) {
      found.push({ file, link, color });
    }
  }
  return found;
}

/** @returns {import("astro").AstroIntegration} */
export default function mobileAccentColor() {
  return {
    name: "mobile-accent-color",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const pages = (await readdir(root, { recursive: true })).filter((path) =>
          path.endsWith(".html"),
        );
        let count = 0;
        for (const { file, link, color } of interactives()) {
          // /interactive/<name>/...: that folder's pages; /interactive/<page>: that page
          const folder = link.match(/^\/(interactive\/[^/]+\/)/)?.[1];
          const page = `${decodeURI(link)
            .slice(1)
            .replace(/\.html$/, "")}.html`;
          const matches = pages.filter((path) =>
            folder ? path.startsWith(folder) : path === page,
          );
          if (matches.length === 0) {
            throw new Error(`Mobile accent color: ${file} links to ${link}, which has no pages.`);
          }
          const tag = `<meta name="mobile-accent-color" content="${color}">`;
          for (const path of matches) {
            const html = await readFile(`${root}/${path}`, "utf8");
            const head = /<head(?=[\s>])[^>]*>/i.exec(html);
            if (!head) {
              throw new Error(`Mobile accent color: ${path} has no <head> to add it to.`);
            }
            // The article's color replaces the layout's default, if the page has one
            const updated = TAG.test(html)
              ? html.replace(TAG, tag)
              : html.slice(0, head.index + head[0].length) +
                tag +
                html.slice(head.index + head[0].length);
            await writeFile(`${root}/${path}`, updated);
            count++;
          }
        }
        logger.info(`Added the mobile accent color to ${count} interactive pages.`);
      },
    },
  };
}
