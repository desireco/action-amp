/**
 * Pure resource data operations — ported from
 * webapp/src/resources/operationsCore.ts (S9; the parity checklist lives in
 * packages/contract/src/s9-search-resources/README.md).
 *
 * Shared by the oRPC actions and any future CLI route: a Resource is
 * project-owned reference material (title + optional normalized link +
 * notes). `projectId` is required and cascade-deletes with the project; there
 * are no loose resources and no delete-with-impact flow. Bodies are verbatim
 * against the webapp original; the differences are type-level only (seam
 * types instead of `@prisma/client`, `.js` import specifiers).
 *
 * URL validation happens here (normalizeUrl) — a bad url rejects the whole
 * create/update with the exact webapp message.
 */
import {
  prepareImageAttachments,
  type ImageAttachmentInput,
} from "../shared/imageAttachments.js";
import type {
  ResourceCreateArgs,
  ResourceFindFirstArgs,
  ResourceUpdateArgs,
} from "../db/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

export type ResourceInput = { title?: string; url?: string; notes?: string };

function normalizeUrl(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const url = value.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("Use a full http:// or https:// link.");
  }
}

async function getProjectResourcesData(
  entities: Entities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  const project = await entities.Project.findFirst({
    where: { userId, OR: [{ id: projectId }, { permalink: projectId }] },
    select: {
      id: true,
      resources: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          url: true,
          notes: true,
          createdAt: true,
          attachments: { select: { id: true, filename: true, mimeType: true } },
        },
      },
    },
  });
  if (!project) throw new Error("Project not found.");
  return project;
}

export async function createResourceCore(
  entities: Entities,
  { userId, projectId, title, url, notes, attachments }: Required<Pick<ResourceInput, "title">> & { userId: string; projectId: string } & ResourceInput & { attachments?: ImageAttachmentInput[] },
) {
  const project = await entities.Project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, lensId: true },
  });
  if (!project) throw new Error("Project not found.");
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Resource title cannot be empty.");
  const preparedAttachments = prepareImageAttachments(attachments);
  const data: ResourceCreateArgs["data"] = {
    title: normalizedTitle,
    url: normalizeUrl(url) ?? null,
    notes: notes?.trim() || null,
    userId,
    projectId: project.id,
  };
  if (preparedAttachments) data.attachments = { create: preparedAttachments };
  const resource = await entities.Resource.create({
    data,
    select: { id: true, title: true, url: true, notes: true, projectId: true },
  });
  return { resource, lensId: project.lensId };
}

/** The guard-read row: the resource plus its project's lens id (the subset
 *  `include: { project: { select: { lensId: true } } }` carries). */
export interface ResourceWithLensRow {
  id: string;
  userId: string;
  projectId: string;
  title: string;
  url: string | null;
  notes: string | null;
  createdAt: Date;
  project: { lensId: string };
}

export async function getResourceData(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
): Promise<ResourceWithLensRow> {
  const args: ResourceFindFirstArgs = {
    where: { id, userId },
    include: { project: { select: { lensId: true } } },
  };
  const resource: ResourceWithLensRow | null = await entities.Resource.findFirst(args);
  if (!resource) throw new Error("Resource not found.");
  return resource;
}

export async function updateResourceCore(
  entities: Entities,
  { userId, id, title, url, notes }: { userId: string; id: string } & ResourceInput,
) {
  const resource = await getResourceData(entities, { userId, id });
  const data: Record<string, string | null> = {};
  if (title !== undefined) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new Error("Resource title cannot be empty.");
    data.title = normalizedTitle;
  }
  const normalizedUrl = normalizeUrl(url);
  if (normalizedUrl !== undefined) data.url = normalizedUrl;
  if (notes !== undefined) data.notes = notes.trim() || null;
  if (Object.keys(data).length === 0) throw new Error("Provide a title, url, or notes to update.");
  const args: ResourceUpdateArgs = {
    where: { id: resource.id },
    data,
    select: { id: true, title: true, url: true, notes: true, projectId: true },
  };
  const updated = await entities.Resource.update(args);
  return { resource: updated, lensId: resource.project.lensId };
}

export async function deleteResourceCore(
  entities: Entities,
  { userId, id }: { userId: string; id: string },
) {
  const resource = await getResourceData(entities, { userId, id });
  await entities.Resource.delete({ where: { id: resource.id } });
  return { id: resource.id, lensId: resource.project.lensId };
}

// getProjectResourcesData is kept module-private for now: the web read rides
// the project detail payload (resources included, createdAt desc) and the CLI
// list route is s18's surface. Exported here so the seam lock can see it the
// moment a CLI surface composes.
export { getProjectResourcesData };
