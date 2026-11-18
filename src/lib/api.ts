/**
 * The public API: every article as JSON, newest first, built with the site (see "API" in
 * README.md). src/pages/api/articles/[page].json.ts serves them a page at a time, and
 * src/pages/api/articles.json.ts says how many pages there are.
 */
import { type Article, articlePath } from "./articles";
import { shareableImage } from "./images";

/** How many articles each page of /api/articles/<page>.json has. */
export const PAGE_SIZE = 20;

/** How many pages of articles there are: at least 1, which is empty if there are no articles. */
export function pageCount(totalArticles: number): number {
  return Math.max(1, Math.ceil(totalArticles / PAGE_SIZE));
}

/** The full URL of /api/articles/<page>.json. */
export function pageURL(page: number, site: URL): string {
  return new URL(`/api/articles/${page}.json`, site).href;
}

export interface ApiArticle {
  /** The article's file name, e.g. "2026-03-03-my-story". Its page is /article/<slug>. */
  slug: string;
  title: string;
  /** Its publish date, "YYYY-MM-DD". */
  date: string;
  /** Where it's read: its page on this site, or, for an interactive or an article hosted on another site, there. */
  url: string;
  /** Its featured image (a JPEG or PNG at most 1200px wide). */
  image: string;
}

export async function apiArticle(article: Article, site: URL): Promise<ApiArticle> {
  const { title, date, featuredImage } = article.data;
  return {
    slug: article.id,
    title,
    // Frontmatter dates are UTC midnight
    date: date.toISOString().slice(0, 10),
    url: new URL(articlePath(article), site).href,
    image: (await shareableImage(featuredImage, site)).url,
  };
}

/** A JSON response. Cross-origin requests are allowed by public/_headers. */
export function json(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
