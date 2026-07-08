// /rss.xml — the blog feed. Lists all published posts (both streams) with
// title, description, link, pubDate. Drafts are excluded (same filter as the
// index, article route, and sitemap — the contract is "a draft is unlisted").
//
// Spec: docs/specs/blog.md (Done-conditions §SEO & feeds).
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getCollection } from "astro:content";

export async function GET(context: APIContext) {
  const posts = await getCollection("blog", ({ data }) => !data.draft);
  const sorted = posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );

  return rss({
    title: "ActionAmp — Blog",
    description:
      "Essays on focus, decisions, and doing the next thing. Finds worth your attention. No schedule, no noise.",
    // context.site is the `site` value from astro.config.ts (actionamp.com).
    site: context.site ?? "https://actionamp.com",
    items: sorted.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      // id === filename stem; the article route is /blog/<id>.
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: `<language>en-us</language>`,
  });
}
