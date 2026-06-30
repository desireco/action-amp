type WelcomeEmailUser = {
  firstName?: string | null;
  preferredName?: string | null;
  identities?: {
    email?: { id?: string } | null;
    google?: { id?: string } | null;
  };
};

type WelcomeEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function resolveRecipientEmail(user: WelcomeEmailUser): string | null {
  const candidates = [user.identities?.email?.id, user.identities?.google?.id];
  return (
    candidates.find((candidate): candidate is string =>
      Boolean(candidate?.includes("@")),
    ) ?? null
  );
}

function welcomeEmailText(firstName: string, appUrl: string): string {
  return `Hi ${firstName},

Welcome to ActionAmp.

The app is built around one loop:

Capture what is on your mind.
Triage it when you are ready.
Start with one task, not a list.

Your first screen is Next. It will show one thing to do first.

Open ActionAmp:
${appUrl}/app`;
}

function welcomeEmailHtml(firstName: string, appUrl: string): string {
  return `
    <p>Hi ${firstName},</p>
    <p>Welcome to ActionAmp.</p>
    <p>The app is built around one loop:</p>
    <p>
      Capture what is on your mind.<br />
      Triage it when you are ready.<br />
      Start with one task, not a list.
    </p>
    <p>Your first screen is Next. It will show one thing to do first.</p>
    <p><a href="${appUrl}/app">Open ActionAmp</a></p>
  `;
}

export function buildWelcomeEmail(
  user: WelcomeEmailUser,
  appUrl = process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000",
): WelcomeEmail | null {
  const to = resolveRecipientEmail(user);
  if (!to) return null;

  const firstName =
    user.preferredName?.trim() || user.firstName?.trim() || "there";
  return {
    to,
    subject: "Your first task is waiting",
    text: welcomeEmailText(firstName, appUrl),
    html: welcomeEmailHtml(firstName, appUrl),
  };
}
