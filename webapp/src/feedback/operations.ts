import type { SubmitFeedback } from "wasp/server/operations";
import { PrismaClient } from "@prisma/client";
import { getAdminEmail, shouldSendFeedbackEmail } from "./config";
import { renderFeedbackEmailHtml } from "../email/FeedbackEmail";
import { submitFeedbackCore } from "./operationsCore";

type FeedbackSection = "work" | "plan" | "review";

type SubmitFeedbackArgs = {
  message: string;
  route?: string | null;
  section?: FeedbackSection | null;
  lens?: {
    id?: string | null;
    name?: string | null;
    color?: string | null;
  } | null;
  userAgent?: string | null;
};

type FeedbackEmailInput = {
  id: string;
  message: string;
  route: string | null;
  section: string | null;
  lensName: string | null;
  lensColor: string | null;
  userName: string | null;
  userEmail: string | null;
  userAgent: string | null;
};

const prisma = new PrismaClient();

async function buildFeedbackEmail(feedback: FeedbackEmailInput) {
  const adminEmail = getAdminEmail();
  const lines = [
    "New ActionAmp feedback",
    "",
    `From: ${feedback.userName || "Unknown"}${feedback.userEmail ? ` <${feedback.userEmail}>` : ""}`,
    `Feedback ID: ${feedback.id}`,
    `Route: ${feedback.route || "-"}`,
    `Section: ${feedback.section || "-"}`,
    `Lens: ${feedback.lensName || "-"}${feedback.lensColor ? ` (${feedback.lensColor})` : ""}`,
    `User agent: ${feedback.userAgent || "-"}`,
    "",
    feedback.message,
  ];

  return {
    to: adminEmail,
    subject: "ActionAmp feedback",
    text: lines.join("\n"),
    html: await renderFeedbackEmailHtml(feedback),
  };
}

async function getUserEmail(userId: string) {
  if (process.env.NODE_ENV === "test") return null;

  const auth = await prisma.auth.findFirst({
    where: { userId },
    include: { identities: true },
  });
  return (
    auth?.identities
      .map((identity) => identity.providerUserId)
      .find((value) => value.includes("@")) ?? null
  );
}

async function maybeSendFeedbackEmail(feedback: FeedbackEmailInput) {
  if (!shouldSendFeedbackEmail()) return;

  const emailModule = "wasp/server/" + "email";
  const { emailSender } = await import(emailModule);
  await emailSender.send(await buildFeedbackEmail(feedback));
}

export const submitFeedback = (async (args: SubmitFeedbackArgs, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }

  const userId = context.user.id;
  const userRow = await context.entities.User.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const userName = userRow?.fullName ?? context.user.fullName ?? null;
  let userEmail: string | null = null;
  try {
    userEmail = await getUserEmail(userId);
  } catch {
    userEmail = null;
  }

  // Message trim + length validation live in the core (shared with any write
  // surface). It throws the same "Feedback is required." / "too long." messages.
  const feedback = await submitFeedbackCore(context.entities, {
    userId,
    message: args.message,
    route: args.route,
    section: args.section,
    lens: args.lens,
    userAgent: args.userAgent,
    userName,
    userEmail,
  });

  try {
    await maybeSendFeedbackEmail(feedback);
  } catch {
    // Feedback is already stored. Email is notification only and must not make
    // the user retry or risk duplicate submissions.
  }

  return { id: feedback.id };
}) satisfies SubmitFeedback<SubmitFeedbackArgs, { id: string }>;
