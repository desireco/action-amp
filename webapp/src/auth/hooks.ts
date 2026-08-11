import type { OnAfterLoginHook } from "wasp/server/auth";
import { boundedLoginProvider, recordLoginActivitySafely } from "./loginActivity";

/** Records built-in email, dev, and future OAuth logins after session creation. */
export const onAfterLogin: OnAfterLoginHook = async ({ prisma, providerId, user }) => {
  await recordLoginActivitySafely(
    { User: prisma.user, LoginEvent: prisma.loginEvent },
    user.id,
    boundedLoginProvider(providerId.providerName),
  );
};
