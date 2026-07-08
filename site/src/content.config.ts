import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Markdown pages (about, privacy, terms) — frontmatter carries the per-page
// title/description that PublicLayout renders into <title>/<meta>.
// Uses the glob loader (Astro 7 API); files live in src/content/.
const pages = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

// Blog posts — two streams (finds + essays) on a shared collection.
// Spec: docs/specs/blog.md. Schema fields are the contract between authoring
// (markdown frontmatter) and rendering (the /blog index, article routes,
// featured zone, RSS feed). The four categories — Focus · Method · Attention ·
// Build — are the navigable taxonomy (rendered as the teal-dotted cat pill).
const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      kind: z.enum(["find", "essay"]),
      // Rendering-only hint for find cards (icon + label). Required when kind is
      // find, ignored for essays (enforced by the refine below).
      findType: z.enum(["watch", "read", "tool", "note"]).optional(),
      tags: z.array(z.enum(["Focus", "Method", "Attention", "Build"])).optional(),
      // Promoted into the featured zone (and deduped out of the lanes below).
      featured: z.boolean().default(false),
      // Hint for which featured slot an item belongs in. "hero" = the big slot in
      // Pattern A; "take" = the smaller slots in either pattern. Optional — the
      // featured-zone renderer falls back by kind.
      featuredAs: z.enum(["hero", "take"]).optional(),
      // contentType distinguishes regular posts from guides/offers so the amber
      // special tag renders on non-post featured content (the rare human-emphasis
      // accent). Posts default to "post".
      contentType: z.enum(["post", "guide", "offer"]).default("post"),
      draft: z.boolean().default(false),
      // Author-provided read-time label (e.g. "9 min"). Optional; never computed
      // (non-goal: "No reading-time calculation"). Used only as a display string.
      readTime: z.string().optional(),
      // Outbound link for finds (the curated pointer). When set, the article page
      // emphasizes the external source — the whole point of a find. Optional so a
      // find can stand alone as a note/quote.
      link: z.string().url().optional(),
      source: z.string().optional(), // human label for the outbound link host
      // Reserved for blog-social-meta (the shareability split). Unused here.
      ogImage: z.string().optional(),
      socialDescription: z.string().optional(),
    })
    // findType is required when kind is "find" (the spec's authoring contract).
    // Ignored for essays. Catches a missing-icon find at build time, not in prod.
    .refine((d) => d.kind !== "find" || d.findType !== undefined, {
      message: "findType is required when kind is 'find'",
      path: ["findType"],
    }),
});

export const collections = { pages, blog };
