import type { SubmitFeedback } from "wasp/server/operations";
import { PrismaClient } from "@prisma/client";
import { getAdminEmail, shouldSendFeedbackEmail } from "./config";
import { renderFeedbackEmailHtml } from "../email/FeedbackEmail";

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

function cleanOptional(value: string | null | undefined, max = 500) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

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

  const message = args.message?.trim();
  if (!message) {
    throw new Error("Feedback is required.");
  }
  if (message.length > 4000) {
    throw new Error("Feedback is too long.");
  }

  const userId = context.user.id;
  const userRow = await context.entities.User.findUnique({
    where: { id: userId },
    select: { fullName: true },
  });
  const userName = cleanOptional(
    userRow?.fullName ?? context.user.fullName ?? null,
    160,
  );
  let userEmail: string | null = null;
  try {
    userEmail = await getUserEmail(userId);
  } catch {
    userEmail = null;
  }

  const feedback = await context.entities.Feedback.create({
    data: {
      message,
      userId,
      userName,
      userEmail,
      route: cleanOptional(args.route, 300),
      section: cleanOptional(args.section, 40),
      lensId: cleanOptional(args.lens?.id, 80),
      lensName: cleanOptional(args.lens?.name, 120),
      lensColor: cleanOptional(args.lens?.color, 80),
      userAgent: cleanOptional(args.userAgent, 500),
    },
    select: {
      id: true,
      message: true,
      route: true,
      section: true,
      lensName: true,
      lensColor: true,
      userName: true,
      userEmail: true,
      userAgent: true,
    },
  });

  try {
    await maybeSendFeedbackEmail(feedback);
  } catch {
    // Feedback is already stored. Email is notification only and must not make
    // the user retry or risk duplicate submissions.
  }

  return { id: feedback.id };
}) satisfies SubmitFeedback<SubmitFeedbackArgs, { id: string }>;
