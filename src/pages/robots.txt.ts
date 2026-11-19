import type { APIRoute } from "astro";

// Generates robots.txt at build time, so the Sitemap line always matches the `site` configured in
// astro.config.mjs. /editors/ holds internal tools for staff only, and /api/ JSON for other sites
// and apps, not readers.
export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL("/sitemap-index.xml", site);

  const body = `User-agent: *
Disallow: /editors/
Disallow: /api/
Allow: /

Sitemap: ${sitemapURL.href}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
};
