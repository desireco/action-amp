import type {
  CreateResource,
  DeleteResource,
  UpdateResource,
} from "wasp/server/operations";
import { assertLensAllowed, throwHttpStatus } from "../billing/entitlementHttp";

function normalizeUrl(value: string | undefined): string | null {
  const url = value?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new Error("Use a full http:// or https:// link.");
  }
}

export const createResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const project = await context.entities.Project.findUnique({
    where: { id: args.projectId, userId: context.user.id },
    select: { id: true, lensId: true },
  });
  if (!project) throwHttpStatus(404, "Project not found.");
  await assertLensAllowed(context, project.lensId);
  const title = args.title.trim();
  if (!title) throw new Error("Resource title cannot be empty.");
  return await context.entities.Resource.create({
    data: {
      title,
      url: normalizeUrl(args.url),
      notes: args.notes?.trim() || null,
      userId: context.user.id,
      projectId: project.id,
    },
    select: { id: true, title: true },
  });
}) satisfies CreateResource<
  { projectId: string; title: string; url?: string; notes?: string },
  { id: string; title: string }
>;

export const updateResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const resource = await context.entities.Resource.findUnique({
    where: { id: args.id, userId: context.user.id },
    include: { project: { select: { lensId: true } } },
  });
  if (!resource) throwHttpStatus(404, "Resource not found.");
  await assertLensAllowed(context, resource.project.lensId);
  const title = args.title.trim();
  if (!title) throw new Error("Resource title cannot be empty.");
  return await context.entities.Resource.update({
    where: { id: resource.id },
    data: { title, url: normalizeUrl(args.url), notes: args.notes?.trim() || null },
    select: { id: true, title: true },
  });
}) satisfies UpdateResource<
  { id: string; title: string; url?: string; notes?: string },
  { id: string; title: string }
>;

export const deleteResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const resource = await context.entities.Resource.findUnique({
    where: { id: args.id, userId: context.user.id },
    include: { project: { select: { lensId: true } } },
  });
  if (!resource) throwHttpStatus(404, "Resource not found.");
  await assertLensAllowed(context, resource.project.lensId);
  await context.entities.Resource.delete({ where: { id: resource.id } });
  return { id: resource.id };
}) satisfies DeleteResource<{ id: string }, { id: string }>;
