/**
 * The email send seam — S10. Port of the webapp's Resend transport
 * (docs/EMAIL-INTEGRATION.md is authority for HOW email is delivered):
 * Resend's HTTPS API (port 443 — Railway SMTP egress times out at CONN, so
 * SMTP is never coming back), `RESEND_API_KEY` env, from
 * "ActionAmp <noreply@actionamp.com>".
 *
 * SIMPLIFICATION vs webapp (noted for review): the webapp renders
 * `MagicLoginEmail` through react-email (`TransactionalEmail` components).
 * This port inlines the same structure as a static HTML template — same
 * title/preview/copy/CTA, the code at 28px/700/0.16em, the muted expiry
 * line, the "Sign in to ActionAmp" button, the Built By Dakic footer — minus
 * the react-email dependency. Subject and text body are byte-identical to
 * the webapp's.
 *
 * Callers own the localhost gate: requestMagicLoginCore skips delivery
 * entirely on localhost (fixed code 111111, no provider needed), so a send
 * here means prod (or a non-localhost client URL). A failed send throws —
 * the core deletes the just-created challenge and surfaces 503.
 */

const RESEND_API = "https://api.resend.com/emails";

/** Wasp emailSender defaultFrom parity (main.wasp.ts). */
export const EMAIL_FROM = "ActionAmp <noreply@actionamp.com>";

/** The exact webapp subject (magicLogin.ts sendLoginEmail). */
export const MAGIC_LOGIN_SUBJECT = "Your ActionAmp sign-in code";

export interface MagicLoginEmailArgs {
  to: string;
  code: string;
  loginUrl: string;
}

/**
 * Minimal static-HTML port of MagicLoginEmail → TransactionalEmail (see the
 * header simplification note). Inline styles only — email clients.
 */
export function renderMagicLoginEmailHtml(args: MagicLoginEmailArgs): string {
  const fontFamily =
    "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif";
  // TransactionalEmail palette, inlined (bg/surface/border/text/muted/teals).
  const c = {
    bg: "#F9FCFE",
    surface: "#FDFFFF",
    border: "#DBE3E7",
    text: "#0F171C",
    textMuted: "#5B656A",
    teal: "#00B9E5",
    tealDark: "#008AC0",
  };
  const esc = (value: string): string =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const code = esc(args.code);
  const loginUrl = esc(args.loginUrl);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${c.bg};color:${c.text};font-family:${fontFamily};">
<div style="width:100%;max-width:640px;margin:0 auto;padding:32px 16px;">
  <div style="padding-bottom:18px;">
    <table role="presentation" cellspacing="0" cellpadding="0"><tbody><tr>
      <td align="center" valign="middle" style="width:26px;height:26px;border-radius:7px;background:${c.tealDark};color:${c.bg};font-size:17px;line-height:26px;font-weight:700;">&#10003;</td>
      <td style="padding-left:10px;font-size:15px;line-height:20px;font-weight:700;color:${c.text};">ActionAmp</td>
    </tr></tbody></table>
  </div>
  <div style="background:${c.surface};border:1px solid ${c.border};border-radius:12px;padding:38px 40px 36px;box-shadow:0 10px 30px rgba(35,44,64,0.08);">
    <div style="width:42px;height:3px;background:${c.teal};border-radius:3px;margin-bottom:26px;"></div>
    <h1 style="margin:0 0 18px;font-size:28px;line-height:34px;font-weight:650;color:${c.text};">Your ActionAmp sign-in code</h1>
    <div style="font-size:16px;line-height:26px;font-weight:400;color:${c.text};">
      <p style="margin:0 0 16px;font-size:16px;line-height:26px;">Use this code to sign in:</p>
      <p style="margin:20px 0;font-size:28px;font-weight:700;letter-spacing:0.16em;">${code}</p>
      <p style="margin:0 0 16px;font-size:16px;line-height:26px;color:#353F44;">It expires in 10 minutes. Or use the button above to sign in directly.</p>
    </div>
    <a href="${loginUrl}" style="display:inline-block;margin-top:28px;border-radius:8px;background:${c.tealDark};padding:12px 18px;font-size:15px;line-height:20px;font-weight:600;color:${c.bg};text-decoration:none;">Sign in to ActionAmp</a>
  </div>
  <p style="margin:18px 6px 0;font-size:13px;line-height:20px;color:${c.textMuted};">One task. Then the next. &middot; Proudly <a href="https://dakic.com" style="color:${c.tealDark};">Built By Dakic</a></p>
</div>
</body></html>`;
}

/**
 * Send the sign-in email through Resend's HTTPS API. Throws on any
 * non-2xx (or a missing API key) — the caller deletes the challenge and
 * answers 503.
 */
export async function sendMagicLoginEmail(args: MagicLoginEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured.");
  }

  const text = `Your ActionAmp sign-in code is ${args.code}. It expires in 10 minutes. Or sign in directly: ${args.loginUrl}`;
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [args.to],
      subject: MAGIC_LOGIN_SUBJECT,
      text,
      html: renderMagicLoginEmailHtml(args),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
}
