import { getCollection } from "astro:content";

const fixedPaths = ["/", "/about/", "/blog/", "/guides/", "/pricing/", "/privacy/", "/roadmap/", "/terms/"];

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Conventional sitemap URL. Unlike the sitemap integration's build-only index,
 * this also works during local `astro dev`, which makes pre-submit checks easy.
 */
export async function GET({ url }: { url: URL }) {
  const [blog, guides] = await Promise.all([
    getCollection("blog", ({ data }) => !data.draft),
    getCollection("guides", ({ data }) => !data.draft),
  ]);
  const paths = [
    ...fixedPaths,
    ...blog.map((post) => `/blog/${post.id}/`),
    ...guides.map((guide) => `/guides/${guide.id}/`),
  ];
  const origin = url.origin;
  const entries = paths.map((path) => `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc></url>`).join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
