/**
 * /api/articles.json: how many pages of articles there are, and their URLs. The articles
 * themselves are in /api/articles/<page>.json. See src/lib/api.ts.
 */
import type { APIRoute } from "astro";
import { json, PAGE_SIZE, pageCount, pageURL } from "../../lib/api";
import { getArticles } from "../../lib/articles";

export const GET: APIRoute = async ({ site }) => {
  const totalArticles = (await getArticles()).length;
  const totalPages = pageCount(totalArticles);
  return json({
    totalPages,
    totalArticles,
    pageSize: PAGE_SIZE,
    // astro.config.mjs always sets `site`
    pages: Array.from({ length: totalPages }, (_, i) => pageURL(i + 1, site!)),
  });
};
