/**
 * /api/articles/<page>.json: a page of PAGE_SIZE articles, newest first, from /api/articles/1.json,
 * with links to the pages before and after it. See src/lib/api.ts.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { apiArticle, json, PAGE_SIZE, pageCount, pageURL } from "../../../lib/api";
import { type Article, getArticles } from "../../../lib/articles";

export const getStaticPaths = (async () => {
  const articles = await getArticles();
  const totalPages = pageCount(articles.length);
  return Array.from({ length: totalPages }, (_, i) => ({
    params: { page: String(i + 1) },
    props: {
      page: i + 1,
      totalPages,
      totalArticles: articles.length,
      articles: articles.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE),
    },
  }));
}) satisfies GetStaticPaths;

interface Props {
  page: number;
  totalPages: number;
  totalArticles: number;
  articles: Article[];
}

export const GET: APIRoute<Props> = async ({ props, site }) => {
  const { page, totalPages, totalArticles, articles } = props;
  return json({
    page,
    totalPages,
    totalArticles,
    pageSize: PAGE_SIZE,
    // astro.config.mjs always sets `site`
    previous: page > 1 ? pageURL(page - 1, site!) : null,
    next: page < totalPages ? pageURL(page + 1, site!) : null,
    articles: await Promise.all(articles.map((article) => apiArticle(article, site!))),
  });
};
