import type {
  CreateResource,
  DeleteResource,
  UpdateResource,
} from "wasp/server/operations";
import { assertLensAllowed, throwHttpStatus } from "../billing/entitlementHttp";
import { createResourceCore, deleteResourceCore, getResourceData, updateResourceCore } from "./operationsCore";

export const createResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const project = await context.entities.Project.findFirst({
    where: { id: args.projectId, userId: context.user.id },
    select: { lensId: true, type: true },
  });
  if (!project) throwHttpStatus(404, "Project not found.");
  if (project.type === "SIMPLE_LIST") {
    throwHttpStatus(400, "A Simple-list Project keeps only checklist items.");
  }
  await assertLensAllowed(context, project.lensId);
  const result = await createResourceCore(context.entities, { userId: context.user.id, ...args });
  return result.resource;
}) satisfies CreateResource<
  { projectId: string; title: string; url?: string; notes?: string },
  { id: string; title: string }
>;

export const updateResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const existing = await getResourceData(context.entities, { userId: context.user.id, id: args.id }).catch(() => null);
  if (!existing) throwHttpStatus(404, "Resource not found.");
  await assertLensAllowed(context, existing.project.lensId);
  return (await updateResourceCore(context.entities, { userId: context.user.id, ...args })).resource;
}) satisfies UpdateResource<
  { id: string; title: string; url?: string; notes?: string },
  { id: string; title: string }
>;

export const deleteResource = (async (args, context) => {
  if (!context.user) throw new Error("Not authenticated.");
  const existing = await getResourceData(context.entities, { userId: context.user.id, id: args.id }).catch(() => null);
  if (!existing) throwHttpStatus(404, "Resource not found.");
  await assertLensAllowed(context, existing.project.lensId);
  const result = await deleteResourceCore(context.entities, { userId: context.user.id, id: args.id });
  return { id: result.id };
}) satisfies DeleteResource<{ id: string }, { id: string }>;
