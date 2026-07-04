import type {
  EnsureOnboarded,
  SetPreferredName,
  CompleteOnboarding,
} from "wasp/server/operations";
import { PrismaClient } from "@prisma/client";
import { buildWelcomeEmail } from "./welcomeEmail";

/**
 * Onboarding — the one-time first-run flow (runs when a user signs up).
 *
 * `ensureOnboarded` — idempotent: creates the default Work + Me lenses for the
 * logged-in user if they don't yet have them. Covers BOTH:
 *   - existing users who predate the Lens feature (first login after deploy)
 *   - brand-new signups
 * Safe to call on every app load.
 *
 * `setPreferredName` — persists the onboarding preferred-name choice.
 *
 * `completeOnboarding` — marks onboarding seen server-side (routes returning
 * users straight to /app).
 *
 * App-shell bootstrap data (`getAppData`) lives in `src/app/operations.ts` —
 * it runs on every load, not just onboarding.
 */

// Each default lens carries an identity color key (see styles/tokens.css
// `--aa-lens-*` palette) and a stable LensKind handle. Work = indigo/WORK,
// Me = emerald/PERSONAL. The color signals which context is active; the kind
// is what the entitlement guard branches on (rename-safe — the user-facing
// name can be anything). It's identity, never system/state (that's teal's job).
const DEFAULT_LENSES = [
  { name: "Work", kind: "WORK", color: "indigo" },
  { name: "Me", kind: "PERSONAL", color: "emerald" },
] as const satisfies readonly { name: string; kind: "WORK" | "PERSONAL"; color: string }[];
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
    // findOrCreate per lens, keyed on KIND (not name) — rename-safe. The user
    // can rename a seeded lens (e.g. "Me" → "Life"); looking up by kind means
    // we find it regardless of its current name, so we never re-seed a second
    // PERSONAL/WORK lens alongside a renamed one. Idempotent across logins.
    const existing = await context.entities.Lens.findFirst({
      where: { userId, kind: lens.kind },
      select: { id: true, name: true, color: true, kind: true },
    });
    if (!existing) {
      const row = await context.entities.Lens.create({
        data: { name: lens.name, kind: lens.kind, color: lens.color, userId },
        select: { id: true, name: true },
      });
      created.push(row);
    } else if (existing.color !== lens.color) {
      // Backfill the identity color if it drifted. We do NOT touch the name or
      // kind here — the name is user-editable, and the kind was already the
      // lookup key (so it's correct by definition).
      await context.entities.Lens.update({
        where: { id: existing.id },
        data: { color: lens.color },
        select: { id: true },
      });
    }
  }

  // Seed a "General" project per lens — the default target for triage's P key
  // (file-in-project). Gives every triaged task a visible home so none are
  // orphaned. Idempotent, like the lens loop above. Looked up by KIND so a
  // renamed seeded lens still gets its General project (rename-safe).
  let meLensId: string | null = null;
  for (const lens of DEFAULT_LENSES) {
    const existingLens = await context.entities.Lens.findFirst({
      where: { userId, kind: lens.kind },
      select: { id: true },
    });
    if (!existingLens) continue;
    if (lens.kind === "PERSONAL") meLensId = existingLens.id;
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

