/**
 * The inbox procedures (S2 capture + S3 inbox/triage) — thin wrappers over the
 * domain cores, mirroring webapp/src/inbox/operations.ts (see the P0 notes:
 * packages/contract/src/s2-capture + s3-inbox-triage READMEs).
 *
 * Layering (the F8b convention): resolve the acting user (`requireUser`),
 * run the entitlement decisions from @actionamp/domain/billing (throwing the
 * typed 402), call a domain core with `context.entities`, map the row to the
 * contract DTO. Validation happened in the contract (zod → 4xx before any
 * handler runs).
 *
 * Entitlement placement is parity-critical: capture has NO gate (the Inbox is
 * universal — FREE users capture freely); triage gates every FILING decision
 * (FREE may file only into the included lens; the `project` decision enforces
 * the per-lens project cap). Archive/delete discard, so they skip the guard.
 *
 * Composed into the mounted router by src/router.ts (the one composition
 * point) — the fragment is delivered uncomposed; the line lives in
 * docs/plans/slices/s2-s3-wiring.md.
 */
import { implement } from "@orpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { contractRouter } from "@actionamp/contract";
import {
  createInboxItemCore,
  getInboxItemsCore,
  triageInboxItemCore,
} from "@actionamp/domain/inbox";
import {
  capViolation,
  FREE_LIMITS,
  lensViolation,
  resolveLens,
  type EntitlementMessage,
} from "@actionamp/domain/billing";
import { inboxItem, lens, listItem, project, resource, task, user } from "@actionamp/domain/db";
import { ORPCError } from "@orpc/server";
import { requireUser, type ApiContext } from "../context.js";

const ORPC = implement(contractRouter).$context<ApiContext>();

// ----------------------------------------------------------------
// Entitlement + error seams (the webapp entitlementHttp.ts analogue)
// ----------------------------------------------------------------

/** Throw the typed 402 the client renders as a calm Pro gate. */
function throwIfViolation(violation: EntitlementMessage | null): void {
  if (violation) {
    // `status: 402` is load-bearing: PAYMENT_REQUIRED is NOT an oRPC built-in
    // code, so without the explicit status the error carries status 500 and
    // validateORPCError (which requires the thrown status to equal the
    // contract's declared status) passes it through UN-defined — the wire
    // answer becomes a 500 instead of the webapp's 402.
    throw new ORPCError("PAYMENT_REQUIRED", {
      status: 402,
      message: `${violation.feature} is a Pro feature.`,
      data: { feature: violation.feature, reason: violation.reason },
    });
  }
}

/**
 * The pure core throws plain Errors for business rules (tenancy, destination/
 * type mismatches, validation). Left alone they surface as raw 500s; rethrow
 * as BAD_REQUEST so the client shows the message itself. Anything non-Error
 * (the tagged 402 above) passes through untouched.
 */
function asBadRequest(err: unknown): never {
  if (err instanceof Error && err.constructor === Error) {
    throw new ORPCError("BAD_REQUEST", { message: err.message });
  }
  throw err as Error;
}

/** The FREE-lens filing guard, injected into the triage core. */
function assertLensAllowed(
  context: ApiContext,
  acting: ReturnType<typeof requireUser>,
): (lensId: string) => Promise<void> {
  return async (lensId) => {
    const lensRow = await resolveLens(context.entities, acting.id, lensId);
    throwIfViolation(lensViolation(acting, lensRow));
  };
}

// ----------------------------------------------------------------
// Row → DTO mappers (presentation slices, not business logic)
// ----------------------------------------------------------------

function toInboxItemDto(row: Awaited<ReturnType<typeof getInboxItemsCore>>[number]) {
  return {
    id: row.id,
    text: row.text,
    title: row.title ?? null,
    content: row.content ?? null,
    sourceUrl: row.sourceUrl ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
    })),
    parsedScheduledDate: row.parsedScheduledDate
      ? row.parsedScheduledDate.toISOString().slice(0, 10)
      : null,
    parsedSnoozedUntil: row.parsedSnoozedUntil
      ? row.parsedSnoozedUntil.toISOString()
      : null,
    parsedPriority: row.parsedPriority ?? null,
    parsedSize: row.parsedSize ?? null,
    parsedTags: row.parsedTags ?? [],
    parsedProject: row.parsedProject ?? null,
    parsedLens: row.parsedLens ?? null,
    parsedProjectId: row.parsedProjectId ?? null,
    parsedLensId: row.parsedLensId ?? null,
  };
}

// ----------------------------------------------------------------
// Procedures
// ----------------------------------------------------------------

/**
 * Capture — the ⌘K popover's submit. The server parses the raw text with the
 * SAME grammar the client previews with, persisting the parsed-* guesses.
 * No entitlement gate (parity: the Inbox is universal). The onboarding stage
 * advance (CAPTURE → TRIAGE) rides along here, exactly as the Wasp wrapper
 * did (conditional updateMany).
 */
const inboxCreate = ORPC.inbox.create.handler(async ({ context, input }) => {
  const acting = requireUser(context);
  let created;
  try {
    created = await createInboxItemCore(context.entities, {
      userId: acting.id,
      text: input.text,
      projectName: input.projectName,
      projectId: input.projectId,
      lensId: input.lensId,
      title: input.title,
      content: input.content,
      sourceUrl: input.sourceUrl,
      // The acting-user row carries no timeZone yet (S10 hydration); the
      // client always sends its IANA zone, so the fallback matches webapp.
      timeZone: input.timeZone ?? "UTC",
    });
  } catch (err) {
    asBadRequest(err);
  }
  // First capture advances first-run guidance (no-op unless mid-onboarding).
  await context.db
    .update(user)
    .set({ onboardingStage: "TRIAGE" })
    .where(and(eq(user.id, acting.id), eq(user.onboardingStage, "CAPTURE")));
  return {
    id: created.id,
    text: created.text,
    createdAt: created.createdAt.toISOString(),
  };
});

/**
 * The queue snapshot — UNPROCESSED items, newest first. Both the /do/inbox
 * list and the review wizard's fixed walkthrough queue read this.
 */
const inboxList = ORPC.inbox.list.handler(async ({ context }) => {
  const acting = requireUser(context);
  const rows = await getInboxItemsCore(context.entities, { userId: acting.id });
  return rows.map(toInboxItemDto);
});

/**
 * Triage — transform + delete the seed. Entitlement gates fire here (402),
 * mapped from the injected guard callbacks; business errors surface as 400s
 * with the core's message. The onboarding TRIAGE → COMPLETE advance rides
 * along, as in the Wasp wrapper.
 */
const inboxTriage = ORPC.inbox.triage.handler(async ({ context, input }) => {
  const acting = requireUser(context);
  let result;
  try {
    result = await triageInboxItemCore(context.entities, {
      userId: acting.id,
      inboxItemId: input.inboxItemId,
      decision: input.decision,
      lensId: input.lensId,
      goalId: input.goalId,
      projectId: input.projectId,
      name: input.name,
      priority: input.priority,
      size: input.size,
      content: input.content,
      assertLens: assertLensAllowed(context, acting),
      assertProjectCap: async (lensId, currentCount) => {
        throwIfViolation(
          capViolation(acting, currentCount, FREE_LIMITS.projects, {
            feature: "a 4th project",
            reason: "organize more than 3 projects with Pro",
          }),
        );
      },
    });
  } catch (err) {
    asBadRequest(err);
  }
  // The first completed triage advances first-run guidance (conditional no-op).
  await context.db
    .update(user)
    .set({ onboardingStage: "COMPLETE" })
    .where(and(eq(user.id, acting.id), eq(user.onboardingStage, "TRIAGE")));
  return result;
});

/**
 * Edit an unprocessed item's captured text in place (the triage card's
 * ~600 ms debounced write-back). UNPROCESSED-only in the WHERE on purpose:
 * triage deletes the item on dispatch, so a late debounce flush after Ready
 * no-ops here instead of racing the delete (updateMany never throws on zero
 * rows).
 */
const inboxUpdate = ORPC.inbox.update.handler(async ({ context, input }) => {
  const acting = requireUser(context);
  const text = input.text.trim();
  if (!text) {
    throw new ORPCError("BAD_REQUEST", { message: "Text cannot be empty." });
  }
  await context.entities.InboxItem.updateMany({
    where: {
      id: input.inboxItemId,
      userId: acting.id,
      status: "UNPROCESSED",
    },
    data: { text },
  });
  return { id: input.inboxItemId };
});

/**
 * Undo an archive — an ARCHIVED item re-enters the unprocessed inbox.
 * Mirrors webapp's restoreArchivedItem: find + userId guard, then the
 * UNPROCESSED flip.
 */
const inboxRestore = ORPC.inbox.restore.handler(async ({ context, input }) => {
  const acting = requireUser(context);
  const rows = await context.db
    .select({ id: inboxItem.id })
    .from(inboxItem)
    .where(and(eq(inboxItem.id, input.inboxItemId), eq(inboxItem.userId, acting.id)))
    .limit(1);
  const item = rows[0];
  if (!item) {
    throw new ORPCError("BAD_REQUEST", { message: "Inbox item not found." });
  }
  await context.entities.InboxItem.update({
    where: { id: item.id },
    data: { status: "UNPROCESSED", archivedAt: null },
  });
  return { id: item.id };
});

/**
 * Project resolver source — lightweight project tuples across ALL the user's
 * lenses, for capture `#` typeahead + triage's project-bridged lens inference
 * and list picker. Lens-agnostic BY DESIGN (visibility ≠ write access —
 * filing still 402s at triage). Most-recently-active first: latest child
 * task/list-item/resource createdAt (fallback: the project's own createdAt),
 * name as tiebreaker. Inline here exactly as the webapp wrapper had it (a
 * cross-table read, not a core): three cheap group-bys on indexed FK columns
 * via the raw Drizzle handle instead of per-project child queries.
 */
const inboxProjectsForResolver = ORPC.inbox.projectsForResolver.handler(
  async ({ context }) => {
    const acting = requireUser(context);
    const lenses = await context.db
      .select({ id: lens.id, name: lens.name, color: lens.color })
      .from(lens)
      .where(eq(lens.userId, acting.id));
    const lensById = new Map(lenses.map((l) => [l.id, l]));
    const projects = await context.db
      .select({
        id: project.id,
        name: project.name,
        permalink: project.permalink,
        type: project.type,
        lensId: project.lensId,
        createdAt: project.createdAt,
      })
      .from(project)
      .where(
        and(
          eq(project.userId, acting.id),
          eq(project.isDone, false),
          isNull(project.archivedAt),
        ),
      )
      .orderBy(project.name);
    // Latest child-entity timestamp per project.
    const [taskActivity, listItemActivity, resourceActivity] = await Promise.all([
      context.db
        .select({ projectId: task.projectId, createdAt: task.createdAt })
        .from(task)
        .where(eq(task.userId, acting.id)),
      context.db
        .select({ projectId: listItem.projectId, createdAt: listItem.createdAt })
        .from(listItem)
        .where(eq(listItem.userId, acting.id)),
      context.db
        .select({ projectId: resource.projectId, createdAt: resource.createdAt })
        .from(resource)
        .where(eq(resource.userId, acting.id)),
    ]);
    const lastActiveAt = new Map<string, Date>();
    for (const row of [...taskActivity, ...listItemActivity, ...resourceActivity]) {
      if (!row.projectId) continue;
      const current = lastActiveAt.get(row.projectId);
      if (!current || row.createdAt > current) lastActiveAt.set(row.projectId, row.createdAt);
    }
    const recentFirst = [...projects].sort((a, b) => {
      const aAt = lastActiveAt.get(a.id) ?? a.createdAt;
      const bAt = lastActiveAt.get(b.id) ?? b.createdAt;
      return bAt.getTime() - aAt.getTime() || a.name.localeCompare(b.name);
    });
    return recentFirst.map((p) => ({
      id: p.id,
      name: p.name,
      permalink: p.permalink,
      type: p.type,
      lensId: p.lensId,
      lensName: lensById.get(p.lensId)?.name ?? null,
      lensColor: lensById.get(p.lensId)?.color ?? null,
    }));
  },
);

/**
 * The user's lenses — Classify's pill radio + the client `[[ ]]` preview's
 * known names (webapp sourced this from getAppData; a small supporting read
 * the inbox fragment owns until that surface composes).
 */
const inboxLenses = ORPC.inbox.lenses.handler(async ({ context }) => {
  const acting = requireUser(context);
  const rows = await context.entities.Lens.findMany({
    where: { userId: acting.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color ?? null,
    isIncluded: l.isIncluded,
  }));
});

/** The implemented inbox fragment — composed by src/router.ts. */
export const inboxProcedures = {
  create: inboxCreate,
  list: inboxList,
  triage: inboxTriage,
  update: inboxUpdate,
  restore: inboxRestore,
  projectsForResolver: inboxProjectsForResolver,
  lenses: inboxLenses,
};
