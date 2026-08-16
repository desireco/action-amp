import type { PrepareDevAutologin } from "wasp/server/operations";
import { HttpError } from "wasp/server";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@wasp.sh/lib-auth/node";

const prisma = new PrismaClient();

const DEV_AUTOLOGIN_PASSWORD =
  process.env.DEV_AUTOLOGIN_PASSWORD ?? "ActionAmpDevAutologin123!";

type PrepareDevAutologinInput = {
  email: string;
};

type PrepareDevAutologinOutput = {
  email: string;
  password: string;
};

function ensureLocalDev() {
  if (process.env.NODE_ENV !== "development") {
    throw new HttpError(404, "Not found.");
  }
}

function normalizeEmail(value: string | undefined) {
  if (!value) {
    throw new HttpError(400, "Email is required.");
  }

  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Enter a valid email.");
  }
  return email;
}

function nameFromEmail(email: string) {
  const localPart = email.split("@")[0] ?? "Dev";
  const words = localPart
    .split(/[._+-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : "Dev User";
}

export const prepareDevAutologin = (async (args) => {
  ensureLocalDev();

  const email = normalizeEmail(args.email);
  const hashedPassword = await hashPassword(DEV_AUTOLOGIN_PASSWORD);
  const existingIdentity = await prisma.authIdentity.findUnique({
    where: {
      providerName_providerUserId: {
        providerName: "email",
        providerUserId: email,
      },
    },
    include: { auth: true },
  });

  if (existingIdentity) {
    if (!existingIdentity.auth.userId) {
      throw new HttpError(500, "Email identity is not linked to a user.");
    }

    const providerData = JSON.parse(existingIdentity.providerData || "{}");
    providerData.hashedPassword = hashedPassword;
    providerData.isEmailVerified = true;
    providerData.emailVerificationSentAt ??= null;
    providerData.passwordResetSentAt ??= null;

    await prisma.authIdentity.update({
      where: {
        providerName_providerUserId: {
          providerName: "email",
          providerUserId: email,
        },
      },
      data: { providerData: JSON.stringify(providerData) },
    });
    await prisma.user.update({
      where: { id: existingIdentity.auth.userId },
      data: { hasSeenOnboarding: true },
    });

    return { email, password: DEV_AUTOLOGIN_PASSWORD };
  }

  const fullName = nameFromEmail(email);
  const firstName = fullName.split(/\s+/)[0] ?? "Dev";

  await prisma.user.create({
    data: {
      fullName,
      firstName,
      hasSeenOnboarding: true,
      auth: {
        create: {
          identities: {
            create: {
              providerName: "email",
              providerUserId: email,
              providerData: JSON.stringify({
                hashedPassword,
                isEmailVerified: true,
                emailVerificationSentAt: null,
                passwordResetSentAt: null,
              }),
            },
          },
        },
      },
    },
  });

  return { email, password: DEV_AUTOLOGIN_PASSWORD };
}) satisfies PrepareDevAutologin<
  PrepareDevAutologinInput,
  PrepareDevAutologinOutput
>;
