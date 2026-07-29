/** Pure resource data operations shared by Wasp actions and the CLI API. */
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

export async function getProjectResourcesData(
  entities: Entities,
  { userId, projectId }: { userId: string; projectId: string },
) {
  const project = await entities.Project.findFirst({
    where: { userId, OR: [{ id: projectId }, { permalink: projectId }] },
    select: {
      id: true,
      resources: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, url: true, notes: true, createdAt: true },
      },
    },
  });
  if (!project) throw new Error("Project not found.");
  return project;
}

export async function createResourceCore(
  entities: Entities,
  { userId, projectId, title, url, notes }: Required<Pick<ResourceInput, "title">> & { userId: string; projectId: string } & ResourceInput,
) {
  const project = await entities.Project.findFirst({
    where: { id: projectId, userId },
    select: { id: true, lensId: true },
  });
  if (!project) throw new Error("Project not found.");
  const normalizedTitle = title.trim();
  if (!normalizedTitle) throw new Error("Resource title cannot be empty.");
  const resource = await entities.Resource.create({
    data: {
      title: normalizedTitle,
      url: normalizeUrl(url) ?? null,
      notes: notes?.trim() || null,
      userId,
      projectId: project.id,
    },
    select: { id: true, title: true, url: true, notes: true, projectId: true },
  });
  return { resource, lensId: project.lensId };
}

export async function getResourceData(entities: Entities, { userId, id }: { userId: string; id: string }) {
  const resource = await entities.Resource.findFirst({
    where: { id, userId },
    include: { project: { select: { lensId: true } } },
  });
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
  const updated = await entities.Resource.update({
    where: { id: resource.id }, data,
    select: { id: true, title: true, url: true, notes: true, projectId: true },
  });
  return { resource: updated, lensId: resource.project.lensId };
}

export async function deleteResourceCore(entities: Entities, { userId, id }: { userId: string; id: string }) {
  const resource = await getResourceData(entities, { userId, id });
  await entities.Resource.delete({ where: { id: resource.id } });
  return { id: resource.id, lensId: resource.project.lensId };
}
