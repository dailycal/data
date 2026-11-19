/**
 * /api/articles.json: when the site was built, how many pages of articles there are, and their
 * URLs. The articles themselves are in /api/articles/<page>.json. See src/lib/api.ts.
 */
import type { APIRoute } from "astro";
import { json, PAGE_SIZE, pageCount, pageURL } from "../../lib/api";
import { getArticles } from "../../lib/articles";

export const GET: APIRoute = async ({ site }) => {
  const totalArticles = (await getArticles()).length;
  const totalPages = pageCount(totalArticles);
  return json({
    // When `npm run build` made this file, e.g. "2026-11-18T22:38:00.000Z" (UTC)
    builtAt: new Date().toISOString(),
    totalPages,
    totalArticles,
    pageSize: PAGE_SIZE,
    // astro.config.mjs always sets `site`
    pages: Array.from({ length: totalPages }, (_, i) => pageURL(i + 1, site!)),
  });
};
