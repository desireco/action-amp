// nodemailer has no bundled types in the server-bundle context (errors
// there), though the SDK build resolves them. Use the ignore flavor so it
// suppresses when needed and stays silent otherwise (the expect flavor would
// error if the underlying error ever disappears).
// @ts-ignore
import nodemailer from "nodemailer";

/**
 * Routes outbound email through Resend's HTTP API (port 443) instead of SMTP.
 *
 * Why this exists:
 *   Railway -> Resend SMTP (ports 465/587) fails with ETIMEDOUT — the TCP/TLS
 *   connection never establishes (constant, not intermittent). Wasp's generated
 *   emailSender uses nodemailer SMTP, and Resend's SMTP is their fallback
 *   transport, known-unreliable from cloud hosts. Resend's HTTP API is the
 *   recommended production integration and runs over plain HTTPS (never
 *   blocked). This also sidesteps the Wasp quirk that its generated SMTP
 *   transport never passes `secure` to nodemailer (so SMTP_SECURE is a no-op).
 *
 * Why a monkeypatch:
 *   Wasp creates the SMTP transporter eagerly at bundle load (before this setup
 *   fn runs), so we can't change its config. Instead we override `sendMail` on
 *   the nodemailer Mailer prototype — every transporter instance shares it, so
 *   the already-created emailSender is covered. The override only activates when
 *   RESEND_API_KEY is present (production); without it the original SMTP
 *   `sendMail` runs unchanged (dev keeps working).
 *
 * Scope: the app uses nodemailer only through Wasp's emailSender, so patching
 * the shared prototype is safe here.
 */
export const serverSetup = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // Dev: keep SMTP.

  type MailOptions = {
    from?: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  };

  // Obtain the shared Mailer prototype via a throwaway transporter. nodemailer
  // opens no connection here — it connects lazily inside sendMail.
  const proto = Object.getPrototypeOf(
    nodemailer.createTransport({
      host: "localhost",
      port: 1,
      auth: { user: "x", pass: "x" },
    }),
  ) as { sendMail: (mail: MailOptions) => Promise<unknown> };

  proto.sendMail = async (mail: MailOptions) => {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mail.from ?? "ActionAmp <noreply@actionamp.com>",
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend API ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as { id?: string };
    return {
      messageId: data.id ?? `resend-${Date.now()}`,
      response: "250 OK",
    };
  };
};
