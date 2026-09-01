import { q } from "typebase-io/db";
import { ServerError } from "typebase-io/server";
import { z } from "zod";

import { links, linkTags, tags } from "../db/schema.ts";
import { authedAction } from "./custom-actions.ts";

const statusSchema = z.enum(["NEW", "KEPT", "DISMISSED"]);
const tagNameSchema = z.string().trim().min(1).max(64);
const urlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use http or https");

const linkOutput = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  title: z.string(),
  status: statusSchema,
  createdAt: z.date(),
  keptAt: z.date().nullable(),
  tags: z.array(z.string()),
});

type LinkStatus = z.infer<typeof statusSchema>;

const titleFromUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "ActionAmp-Link-Garden-Spike/1.0" },
      signal: AbortSignal.timeout(5_000),
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || !contentType.includes("text/html")) return url;

    const html = (await response.text()).slice(0, 250_000);
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, " ")
      .trim();

    return title || url;
  } catch {
    return url;
  }
};

// Typebase passes its generated Drizzle client to every action. The public
// `InferDB` helper describes table rows, not that runtime client, so these
// shared action helpers intentionally accept the client structurally.
const findOrCreateTag = async (db: any, userId: string, name: string) => {
  const existing = await db.query.tags.findFirst({ where: { userId, name } });
  if (existing) return existing;

  const inserted = await db.insert(tags).values({ userId, name }).returning();
  const tag = inserted.at(0);
  if (!tag) throw new ServerError("INTERNAL_SERVER_ERROR");
  return tag;
};

const toLinkOutput = (link: {
  id: string;
  url: string;
  title: string;
  status: LinkStatus;
  createdAt: Date;
  keptAt: Date | null;
}, tagNames: string[]) => ({ ...link, tags: tagNames });

const tagNamesForLink = async (db: any, linkId: string) => {
  const rows = await db
    .select({ name: tags.name })
    .from(linkTags)
    .innerJoin(tags, q.eq(linkTags.tagId, tags.id))
    .where(q.eq(linkTags.linkId, linkId))
    .orderBy(tags.name);

  return rows.map((row: { name: string }) => row.name);
};

export const create = authedAction
  .input(z.object({ url: urlSchema, tags: z.array(tagNameSchema).default([]) }))
  .output(linkOutput)
  .handler(async ({ db, input, user }) => {
    const linkTagsToCreate = [...new Set(input.tags)];
    const inserted = await db
      .insert(links)
      .values({ userId: user.id, url: input.url, title: await titleFromUrl(input.url), status: "NEW" })
      .returning();
    const link = inserted.at(0);
    if (!link) throw new ServerError("INTERNAL_SERVER_ERROR");

    for (const tagName of linkTagsToCreate) {
      const tag = await findOrCreateTag(db, user.id, tagName);
      await db.insert(linkTags).values({ linkId: link.id, tagId: tag.id }).onConflictDoNothing();
    }

    return toLinkOutput(link, linkTagsToCreate);
  });

export const list = authedAction
  .input(z.object({ status: statusSchema.optional(), tag: tagNameSchema.optional() }).default({}))
  .output(z.array(linkOutput))
  .handler(async ({ db, input, user }) => {
    const filters = [q.eq(links.userId, user.id)];
    if (input.status) filters.push(q.eq(links.status, input.status));
    if (input.tag) {
      const matchingRows = await db
        .select({ linkId: linkTags.linkId })
        .from(linkTags)
        .innerJoin(tags, q.eq(linkTags.tagId, tags.id))
        .where(q.and(q.eq(tags.userId, user.id), q.eq(tags.name, input.tag)));
      const matchingLinkIds = matchingRows.map((row) => row.linkId);
      if (matchingLinkIds.length === 0) return [];
      filters.push(q.inArray(links.id, matchingLinkIds));
    }

    const rows = await db
      .select({ link: links, tagName: tags.name })
      .from(links)
      .leftJoin(linkTags, q.eq(linkTags.linkId, links.id))
      .leftJoin(tags, q.eq(linkTags.tagId, tags.id))
      .where(q.and(...filters))
      .orderBy(q.desc(links.createdAt));

    const grouped = new Map<string, ReturnType<typeof toLinkOutput>>();
    for (const row of rows) {
      const existing = grouped.get(row.link.id);
      if (existing) {
        if (row.tagName) existing.tags.push(row.tagName);
      } else {
        grouped.set(row.link.id, toLinkOutput(row.link, row.tagName ? [row.tagName] : []));
      }
    }

    return [...grouped.values()];
  });

export const setStatus = authedAction
  .input(z.object({ id: z.string().uuid(), status: statusSchema }))
  .output(linkOutput)
  .handler(async ({ db, input, user }) => {
    const updated = await db
      .update(links)
      .set({ status: input.status, keptAt: input.status === "KEPT" ? new Date() : null })
      .where(q.and(q.eq(links.id, input.id), q.eq(links.userId, user.id)))
      .returning();
    const link = updated.at(0);
    if (!link) throw new ServerError("NOT_FOUND");

    return toLinkOutput(link, await tagNamesForLink(db, link.id));
  });

export const addTag = authedAction
  .input(z.object({ id: z.string().uuid(), name: tagNameSchema }))
  .output(linkOutput)
  .handler(async ({ db, input, user }) => {
    const link = await db.query.links.findFirst({ where: { id: input.id, userId: user.id } });
    if (!link) throw new ServerError("NOT_FOUND");

    const tag = await findOrCreateTag(db, user.id, input.name);
    await db.insert(linkTags).values({ linkId: link.id, tagId: tag.id }).onConflictDoNothing();

    return toLinkOutput(link, await tagNamesForLink(db, link.id));
  });
