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

export const collections = { pages };
