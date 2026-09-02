/**
 * S14 — the welcome + feedback email seams (the remaining senders).
 *
 * The shared transport constants live in S10's `./email.ts` (magic-login +
 * the Resend postures); this module adds the two seams S14 owns. Ported from
 * webapp/src/onboarding/welcomeEmail.tsx and
 * webapp/src/feedback/{operations.ts,config.ts} (parity checklist:
 * packages/contract/src/s14-emails-cron/README.md §2.2/§2.3).
 *
 * Call-site postures (deliberate, per the webapp — do not "fix"):
 *   - welcome  → best-effort; onboarding must never fail because its email
 *     did. Call site: **S13's `completeOnboarding`** (once per account, on
 *     onboarding completion) — wrap in try/catch and swallow.
 *   - feedback → production-only; the Feedback row is the source of truth.
 *     Call site: **S17's `submitFeedback` op** — call AFTER the row is saved
 *     and swallow (`sendFeedbackNotificationEmail` gates + returns null in
 *     non-production; still wrap for transport errors).
 */
import { EMAIL_FROM } from "./email.js";

/** The app's public URL — link building (webapp env: WASP_WEB_CLIENT_URL). */
function appUrl(): string {
  return (
    process.env.APP_CLIENT_URL ??
    process.env.WASP_WEB_CLIENT_URL ??
    "http://localhost:5174"
  );
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send via Resend's HTTPS API (the same transport S10 uses — port 443 is the
 * only reliable egress from the deploy host). Throws on an unconfigured or
 * failed send — best-effort call sites wrap this.
 */
export async function sendEmail(email: OutgoingEmail): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("Email is not configured (missing RESEND_API_KEY).");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: EMAIL_FROM, ...email }),
  });
  if (!res.ok) {
    throw new Error(`Email send failed (HTTP ${res.status}).`);
  }
  const body = (await res.json()) as { id?: string };
  return { id: body.id ?? "" };
}

// ----------------------------------------------------------------
// Shared transactional layout (webapp src/email/TransactionalEmail.tsx —
// title/preview/CTA + the fixed footer; minimal static HTML port, same
// simplification S10 noted for the magic-login template)
// ----------------------------------------------------------------

function transactionalHtml(parts: {
  title: string;
  preview?: string;
  bodyHtml: string;
  cta?: { label: string; href: string };
}): string {
  const cta = parts.cta
    ? `<p style="margin:24px 0 0;"><a href="${parts.cta.href}" style="display:inline-block;background:#008AC0;color:#FDFFFF;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:15px;font-weight:600;">${parts.cta.label}</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F9FCFE;color:#0F171C;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;">${parts.preview ?? parts.title}</span>
<div style="width:100%;max-width:640px;margin:0 auto;padding:32px 16px;">
  <div style="padding-bottom:18px;font-size:15px;font-weight:700;">ActionAmp</div>
  <div style="background:#FDFFFF;border:1px solid #DBE3E7;border-radius:12px;padding:38px 40px 36px;">
    <div style="width:42px;height:3px;background:#00B9E5;border-radius:3px;margin-bottom:26px;"></div>
    <h1 style="margin:0 0 18px;font-size:24px;line-height:30px;font-weight:650;color:#0F171C;">${parts.title}</h1>
    <div style="font-size:16px;line-height:26px;color:#2c3135;">${parts.bodyHtml}</div>
    ${cta}
  </div>
  <p style="margin:18px 6px 0;font-size:13px;line-height:20px;color:#5B656A;">One task. Then the next. &middot; Proudly <a href="https://dakic.com" style="color:#008AC0;">Built By Dakic</a></p>
</div>
</body></html>`;
}

export interface BuiltEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

// ----------------------------------------------------------------
// Welcome email
// ----------------------------------------------------------------

export interface WelcomeEmailUser {
  email: string;
  firstName?: string | null;
  preferredName?: string | null;
}

function welcomeEmailText(firstName: string, url: string): string {
  return `Hi ${firstName},

Welcome to ActionAmp.

The app is built around one loop:

Capture what is on your mind.
Triage it when you are ready.
Start with one task, not a list.

Your first screen is Next. It will show one thing to do first.

Open ActionAmp:
${url}`;
}

/** Build the welcome email — subject/name-fallback/text are the webapp's. */
export function buildWelcomeEmail(
  user: WelcomeEmailUser,
  baseUrl = appUrl(),
): BuiltEmail {
  // The webapp's name fallback chain (preferredName → firstName → "there").
  const firstName = user.preferredName?.trim() || user.firstName?.trim() || "there";
  const url = `${baseUrl}/do`;
  return {
    to: user.email,
    subject: "Your first task is waiting",
    text: welcomeEmailText(firstName, url),
    html: transactionalHtml({
      title: "Your first task is waiting",
      preview: "Start with one task, not a list.",
      cta: { label: "Open ActionAmp", href: url },
      bodyHtml: `<p style="margin:0 0 12px;">Hi ${firstName},</p>
<p style="margin:0 0 12px;">Welcome to ActionAmp.</p>
<p style="margin:0 0 12px;color:#5B656A;">The app is built around one loop:</p>
<p style="margin:0 0 12px;">Capture what is on your mind.<br/>Triage it when you are ready.<br/>Start with one task, not a list.</p>
<p style="margin:0;">Your first screen is Next. It will show one thing to do first.</p>`,
    }),
  };
}

/** Build + send. Throws — the S13 call site swallows (best-effort by design). */
export async function sendWelcomeEmail(
  user: WelcomeEmailUser,
  baseUrl = appUrl(),
): Promise<{ id: string }> {
  return await sendEmail(buildWelcomeEmail(user, baseUrl));
}

// ----------------------------------------------------------------
// Feedback notification
// ----------------------------------------------------------------

const DEFAULT_ADMIN_EMAIL = "zeljko@dakic.com";

/** The feedback heads-up recipient (webapp feedback/config.ts). */
export function getAdminEmail(): string {
  return process.env.ACTIONAMP_ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
}

/** Production-only (webapp feedback/config.ts shouldSendFeedbackEmail). */
export function shouldSendFeedbackEmail(): boolean {
  return process.env.NODE_ENV === "production";
}

export interface FeedbackEmailInput {
  id: string;
  message: string;
  route: string | null;
  section: string | null;
  lensName: string | null;
  lensColor: string | null;
  userName: string | null;
  userEmail: string | null;
  userAgent: string | null;
  viewport: string | null;
  timezone: string | null;
}

/** Build the feedback heads-up — subject + text lines are the webapp's. */
export function buildFeedbackEmail(feedback: FeedbackEmailInput): BuiltEmail {
  const lines = [
    "New ActionAmp feedback",
    "",
    `From: ${feedback.userName || "Unknown"}${feedback.userEmail ? ` <${feedback.userEmail}>` : ""}`,
    `Feedback ID: ${feedback.id}`,
    `Route: ${feedback.route || "-"}`,
    `Section: ${feedback.section || "-"}`,
    `Lens: ${feedback.lensName || "-"}${feedback.lensColor ? ` (${feedback.lensColor})` : ""}`,
    `User agent: ${feedback.userAgent || "-"}`,
    `Viewport: ${feedback.viewport || "-"}`,
    `Timezone: ${feedback.timezone || "-"}`,
    "",
    feedback.message,
  ];
  const meta = `From: ${feedback.userName || "Unknown"}${feedback.userEmail ? ` <${feedback.userEmail}>` : ""} · ${feedback.route || "-"}${feedback.lensName ? ` · ${feedback.lensName}` : ""}`;
  return {
    to: getAdminEmail(),
    subject: "ActionAmp feedback",
    text: lines.join("\n"),
    html: transactionalHtml({
      title: "New ActionAmp feedback",
      bodyHtml: `<p style="margin:0 0 12px;color:#5B656A;">${meta}</p>
<pre style="margin:0;white-space:pre-wrap;font-family:inherit;font-size:14px;">${feedback.message}</pre>`,
    }),
  };
}

/**
 * The production gate + send. Call-site contract (S17): call AFTER the
 * Feedback row is saved and swallow failures. Non-production → null (no
 * send); transport errors throw (swallow at the call site).
 */
export async function sendFeedbackNotificationEmail(
  feedback: FeedbackEmailInput,
): Promise<{ id: string } | null> {
  if (!shouldSendFeedbackEmail()) return null;
  return await sendEmail(buildFeedbackEmail(feedback));
}
