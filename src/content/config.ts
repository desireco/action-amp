import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const inbox = defineCollection({
  loader: glob({ pattern: "*.md", base: "./data/inbox" }),
  schema: z.object({
    id: z.string(),
    type: z.enum(['action', 'note', 'link', 'idea', 'resource']).optional(), // Optional because spec says type is undecided for some
    title: z.string(),
    captured: z.coerce.date(),
  }),
});

const areas = defineCollection({
  loader: glob({ pattern: "*/area.toml", base: "./data/areas" }),
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    active: z.boolean().default(true),
    created: z.coerce.date(),
    icon: z.string().default('home'),
    color: z.string().default('blue'),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "*/*/project.toml", base: "./data/areas" }),
  schema: z.object({
    name: z.string(),
    area: z.string(),
    status: z.enum(['active', 'archived', 'completed', 'on_hold']).default('active'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    created: z.coerce.date(),
    due_date: z.coerce.date().optional(),
    description: z.string().optional(),
    archived_date: z.coerce.date().optional(),
    archived_reason: z.string().optional(),
  }),
});

const actions = defineCollection({
  loader: glob({ pattern: "*/*/act-*.md", base: "./data/areas" }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['draft', 'todo', 'completed', 'in_progress', 'blocked', 'cancelled']).default('draft'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    created: z.coerce.date(),
    completed: z.coerce.date().optional(),
  }),
});

const reviews = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./data/reviews" }),
  schema: z.object({
    type: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
    date: z.coerce.date(),
  }),
});

export const collections = {
  inbox,
  areas,
  projects,
  actions,
  reviews,
};
