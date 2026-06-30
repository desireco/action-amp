import type {
  EnsureOnboarded,
  GetAppData,
  SetPreferredName,
  CompleteOnboarding,
} from "wasp/server/operations";
import { PrismaClient } from "@prisma/client";
import { buildWelcomeEmail } from "./welcomeEmail";

/**
 * Onboarding + app bootstrap data.
 *
 * `ensureOnboarded` — idempotent: creates the default Work + Me lenses for the
 * logged-in user if they don't yet have them. Covers BOTH:
 *   - existing users who predate the Lens feature (first login after deploy)
 *   - brand-new signups
 * Safe to call on every app load.
 *
 * `setPreferredName` — persists the onboarding preferred-name choice.
 *
 * `getAppData` — returns the user's lenses (and, later, the rest of the shell
 * data) so the client can populate the sidebar + scope the focus engine.
 */

// Each default lens carries an identity color key (see styles/tokens.css
// `--aa-lens-*` palette). Work = indigo, Me = emerald. The color signals which
// context is active; it's identity, never system/state (that's teal's job).
const DEFAULT_LENSES = [
  { name: "Work", color: "indigo" },
  { name: "Me", color: "emerald" },
] as const;
const STARTER_TASKS = [
  "Try it: complete this task",
  "Capture one real thing on your mind",
  "Open the Inbox and decide what that thing becomes",
] as const;

// The recipient address is NOT on context.user (the User entity has no email
// column — even billing creates Stripe customers without one). It lives on
// AuthIdentity: for the email provider, `providerUserId` IS the address. Auth
// isn't exposed via context.entities (Wasp holds auth models internal), so we
// reach it via a direct PrismaClient — the same pattern scripts/ uses. One
// module-level instance (PrismaClient is designed as a long-lived singleton).
const prisma = new PrismaClient();

async function sendWelcomeEmail(user: {
  id: string;
  firstName?: string | null;
  preferredName?: string | null;
}) {
  const auth = await prisma.auth.findFirst({
    where: { userId: user.id },
    include: { identities: true },
  });
  if (!auth) return;

  // Map Wasp's flat AuthIdentity rows into the {email, google} shape
  // buildWelcomeEmail expects. providerUserId is the address for the email
  // provider; for google it's a sub id (filtered out by the @ check inside).
  const identities = { email: null as { id: string } | null, google: null as { id: string } | null };
  for (const identity of auth.identities) {
    if (identity.providerName === "email") identities.email = { id: identity.providerUserId };
    else if (identity.providerName === "google") identities.google = { id: identity.providerUserId };
  }

  const email = buildWelcomeEmail({ ...user, identities });
  if (!email) return;

  // ponytail: string-concat the module path so `wasp compile` doesn't try to
  // statically resolve `wasp/server/email` before the SDK is generated. A
  // direct import broke compile in earlier Wasp phases; revisit if it resolves.
  const emailModule = "wasp/server/" + "email";
  const { emailSender } = await import(emailModule);
  await emailSender.send(email);
}

export const ensureOnboarded = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;
  const created: { name: string; id: string }[] = [];

  for (const lens of DEFAULT_LENSES) {
    // findOrCreate per lens — idempotent across logins
    const existing = await context.entities.Lens.findFirst({
      where: { userId, name: lens.name },
      select: { id: true, name: true, color: true },
    });
    if (!existing) {
      const row = await context.entities.Lens.create({
        data: { name: lens.name, color: lens.color, userId },
        select: { id: true, name: true },
      });
      created.push(row);
    } else if (existing.color !== lens.color) {
      // Backfill: existing lenses predate the color column (or drifted). Patch
      // them up to the default identity color. Safe + idempotent.
      await context.entities.Lens.update({
        where: { id: existing.id },
        data: { color: lens.color },
        select: { id: true },
      });
    }
  }

  // Seed a "General" project per lens — the default target for triage's P key
  // (file-in-project). Gives every triaged task a visible home so none are
  // orphaned. Idempotent, like the lens loop above.
  // ponytail: queries all lenses (existing + just-created) via findFirst by name;
  // a dedicated "all lenses" query would be cleaner but this reuses the loop.
  let meLensId: string | null = null;
  for (const lens of DEFAULT_LENSES) {
    const existingLens = await context.entities.Lens.findFirst({
      where: { userId, name: lens.name },
      select: { id: true },
    });
    if (!existingLens) continue;
    if (lens.name === "Me") meLensId = existingLens.id;
    const existingProject = await context.entities.Project.findFirst({
      where: { userId, lensId: existingLens.id, name: "General" },
      select: { id: true },
    });
    if (!existingProject) {
      await context.entities.Project.create({
        data: { name: "General", userId, lensId: existingLens.id },
        select: { id: true },
      });
    }
  }

  // Seed a tiny starter set for brand-new users so Next is non-empty and the
  // first session teaches the loop by doing it. Guarded by "user has zero
  // tasks" so existing users get nothing new (idempotent across logins).
  // Placed in the Me lens, status=TODAY so getTopTask surfaces them.
  if (meLensId) {
    const taskCount = await context.entities.Task.count({ where: { userId } });
    if (taskCount === 0) {
      for (const description of STARTER_TASKS) {
        await context.entities.Task.create({
          data: {
            description,
            userId,
            lensId: meLensId,
            status: "TODAY",
            priority: "NORMAL",
            size: "S",
          },
          select: { id: true },
        });
      }
    }
  }

  return { createdLenses: created };
}) satisfies EnsureOnboarded<
  never,
  { createdLenses: { name: string; id: string }[] }
>;

/**
 * Sets the user's preferred name (the onboarding "what should we call you?"
 * step). Independent of `ensureOnboarded` so it can be called once and skipped.
 */
export const setPreferredName = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  const name = args.preferredName?.trim();
  if (!name) {
    throw new Error("Preferred name is required.");
  }
  await context.entities.User.update({
    where: { id: context.user.id },
    data: { preferredName: name },
  });
  return { preferredName: name };
}) satisfies SetPreferredName<
  { preferredName: string },
  { preferredName: string }
>;

/**
 * Marks onboarding complete server-side. Persists `User.hasSeenOnboarding=true`
 * so the client can route returning users straight to /app and show new users
 * /welcome exactly once. Idempotent: re-calling on an already-complete user is
 * a no-op. Replaces the old localStorage gate (which didn't survive a browser
 * switch or a clear).
 */
export const completeOnboarding = (async (_args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  if (context.user.hasSeenOnboarding) {
    return { hasSeenOnboarding: true };
  }

  await context.entities.User.update({
    where: { id: context.user.id },
    data: { hasSeenOnboarding: true },
  });

  try {
    await sendWelcomeEmail(context.user);
  } catch {
    // Welcome email is a helpful follow-up, not a gate. Onboarding completion
    // must not fail because SMTP is unavailable or a provider rejects delivery.
  }

  return { hasSeenOnboarding: true };
}) satisfies CompleteOnboarding<never, { hasSeenOnboarding: boolean }>;

/**
 * Everything the app shell needs on first paint: lenses (for the sidebar's
 * Work/Me switch and to scope queries), plus counts for nav badges.
 *
 * Focus-nav counts (today/projects/goals) are scoped to the active Lens so the
 * badges match what each list page actually shows (TodayPage, ProjectsPage,
 * GoalsPage all query by `lensId`). Inbox is NOT lens-scoped — it's the global
 * pre-triage pool (InboxItem has no lens until triage assigns one).
 *
 * The active lens is client-side localStorage state, so the client passes its
 * name in. We resolve name→id server-side (the authoritative source) and fall
 * back to the first lens if the name is stale (e.g. still "Work" before lenses
 * load) — mirroring AppShell's own activeLens self-heal.
 */
export const getAppData = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;

  // ---- Daily Today → Upcoming rollover (lazy, on app load) ----
  // WORKFLOW.md §2.3: Today is the committed-for-today list. At the start of a
  // new calendar day, incomplete TODAY tasks roll to UPCOMING so Today starts
  // fresh each morning — a deliberate re-commitment, not a backlog. Done tasks
  // are left alone (they keep their status + completedAt for the Logbook).
  // `startedAt` (the "Now" state) is preserved, so an interrupted focus task
  // still resurfaces as #1 on Next even though it's now UPCOMING.
  //
  // Triggered lazily here (not a cron job) so it runs in dev (SQLite-free) and
  // needs no new infra. Idempotent: once lastTodayRolloverAt is "today", the
  // day check short-circuits. Day boundary is the server's local calendar day
  // (same precedent as getDoneToday's midnight logic in tasks/operations.ts).
  // Note: we read lastTodayRolloverAt via an explicit User fetch rather than
  // context.user — Wasp's auth user record isn't guaranteed to carry custom
  // fields, but the User entity delegate always does.
  const userRow = await context.entities.User.findUnique({
    where: { id: userId },
    select: { lastTodayRolloverAt: true },
  });
  const lastRoll = userRow?.lastTodayRolloverAt ?? null;
  if (!lastRoll || isDifferentDay(lastRoll, new Date())) {
    await context.entities.Task.updateMany({
      where: { userId, status: "TODAY", isDone: false },
      data: { status: "UPCOMING" },
    });
    await context.entities.User.update({
      where: { id: userId },
      data: { lastTodayRolloverAt: new Date() },
    });
  }

  const lenses = await context.entities.Lens.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true },
  });
  // Resolve the requested lens name to an id; fall back to the first lens so
  // counts are never empty just because the stored name was stale/missing.
  // If the user somehow has no lenses yet, lensWhere stays empty — but every
  // Task/Project/Goal requires a lensId, so the counts are 0 regardless.
  const activeLensId =
    (args?.lensName && lenses.find((l) => l.name === args.lensName)?.id) ||
    lenses[0]?.id;
  const lensWhere = activeLensId ? { lensId: activeLensId } : {};

  const [inboxCount, todayCount, projectCount, goalCount] = await Promise.all([
    context.entities.InboxItem.count({ where: { userId } }),
    // Focus-nav counts: lens-scoped to match the list pages.
    context.entities.Task.count({
      where: { userId, ...lensWhere, status: "TODAY", isDone: false },
    }),
    context.entities.Project.count({
      where: { userId, ...lensWhere, isDone: false },
    }),
    context.entities.Goal.count({
      where: { userId, ...lensWhere, isDone: false },
    }),
  ]);

  return {
    lenses,
    counts: {
      inbox: inboxCount,
      today: todayCount,
      projects: projectCount,
      goals: goalCount,
    },
  };
}) satisfies GetAppData<
  { lensName?: string | null },
  {
    lenses: { id: string; name: string; color: string | null }[];
    counts: { inbox: number; today: number; projects: number; goals: number };
  }
>;

/**
 * Calendar-day inequality — drives the lazy Today rollover. True when `a` and
 * `b` fall on different Y/M/D (in their own locale). Returns true when `a` is
 * null is handled by the caller (the `!lastRoll` check), so this assumes two
 * valid dates.
 */
function isDifferentDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}
