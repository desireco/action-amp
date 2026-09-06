import { Text, render } from "react-email";
import {
  TransactionalEmail,
  transactionalEmailMutedTextStyle,
  transactionalEmailTextStyle,
} from "../email/TransactionalEmail";

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

type WelcomeEmailTemplateProps = {
  firstName: string;
  appUrl: string;
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
${appUrl}/do`;
}

export function WelcomeEmailTemplate({
  firstName,
  appUrl,
}: WelcomeEmailTemplateProps) {
  return (
    <TransactionalEmail
      title="Your first task is waiting"
      preview="Start with one task, not a list."
      cta={{
        label: "Open ActionAmp",
        href: `${appUrl}/do`,
      }}
    >
      <>
        <Text style={transactionalEmailTextStyle}>Hi {firstName},</Text>
        <Text style={transactionalEmailTextStyle}>Welcome to ActionAmp.</Text>
        <Text style={transactionalEmailMutedTextStyle}>
          The app is built around one loop:
        </Text>
        <Text style={transactionalEmailTextStyle}>
          Capture what is on your mind.
          <br />
          Triage it when you are ready.
          <br />
          Start with one task, not a list.
        </Text>
        <Text style={{ ...transactionalEmailTextStyle, marginBottom: 0 }}>
          Your first screen is Next. It will show one thing to do first.
        </Text>
      </>
    </TransactionalEmail>
  );
}

async function welcomeEmailHtml(
  firstName: string,
  appUrl: string,
): Promise<string> {
  return render(<WelcomeEmailTemplate firstName={firstName} appUrl={appUrl} />);
}

export async function buildWelcomeEmail(
  user: WelcomeEmailUser,
  appUrl = process.env.WASP_WEB_CLIENT_URL ?? "http://localhost:4000",
): Promise<WelcomeEmail | null> {
  const to = resolveRecipientEmail(user);
  if (!to) return null;

  const firstName =
    user.preferredName?.trim() || user.firstName?.trim() || "there";
  return {
    to,
    subject: "Your first task is waiting",
    text: welcomeEmailText(firstName, appUrl),
    html: await welcomeEmailHtml(firstName, appUrl),
  };
}
