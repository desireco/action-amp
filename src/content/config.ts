import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const inbox = defineCollection({
  loader: glob({ pattern: "*.md", base: "./data/inbox" }),
  schema: z.object({
    id: z.string(),
    type: z.enum(['action', 'resource', 'note']).optional(), // Optional because spec says type is undecided for some
    title: z.string(),
    captured: z.date(),
  }),
});

const areas = defineCollection({
  loader: glob({ pattern: "*/area.toml", base: "./data/areas" }),
  schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    active: z.boolean().default(true),
    created: z.date(),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: "*/*/project.toml", base: "./data/areas" }),
  schema: z.object({
    name: z.string(),
    area: z.string(),
    status: z.enum(['active', 'archived', 'completed', 'on_hold']).default('active'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    created: z.date(),
    due_date: z.date().optional(),
    description: z.string().optional(),
    archived_date: z.date().optional(),
    archived_reason: z.string().optional(),
  }),
});

const actions = defineCollection({
  loader: glob({ pattern: "*/*/act-*.md", base: "./data/areas" }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['todo', 'completed', 'in_progress', 'blocked', 'cancelled']).default('todo'),
    priority: z.enum(['high', 'medium', 'low']).default('medium'),
    created: z.date(),
    completed: z.date().optional(),
  }),
});

export const collections = {
  inbox,
  areas,
  projects,
  actions,
};
