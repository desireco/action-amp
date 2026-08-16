/**
 * `mintCliToken` — the Wasp action that mints a PAT for the OAuth CLI login.
 *
 * Why a Wasp action (not the existing `/api/pat/issue` custom route):
 * the browser's `/cli/login` page needs to mint cross-origin (page is on the
 * web client origin; the mint persists on the API origin). Wasp actions go
 * through the `/operations/*` router, which has CORS + credentials properly
 * configured globally. Custom `api()` routes mount without the global
 * middleware for OPTIONS, so their cross-origin preflight breaks in browsers.
 * Using the action path is the clean fix — and it's the idiomatic Wasp way
 * for a browser-callable server operation.
 *
 * The existing `/api/pat/issue` route stays for the Settings UI's manual
 * issue flow (which has the same latent CORS issue but is lower-traffic and
 * can be migrated later). This action is specifically for the OAuth flow.
 */
import type { MintCliToken } from "wasp/server/operations";
import { generateToken, hashToken } from "./pat";
import { assertCliAccess } from "../billing/entitlementHttp";

export const mintCliToken = (async (args, context) => {
  if (!context.user) {
    throw new Error("Not authenticated.");
  }
  assertCliAccess(context);
  const label =
    args?.label?.constructor === String
      ? args.label.trim().slice(0, 80)
      : "CLI";
  const plaintext = generateToken();
  const hashedToken = hashToken(plaintext);
  await context.entities.ApiKey.create({
    data: { hashedToken, label, userId: context.user.id },
  });
  // Plaintext returned exactly once. The /cli/login page redirects the
  // browser to the CLI's localhost callback with this token in the URL.
  return { token: plaintext, label };
}) satisfies MintCliToken<{ label: string }, { token: string; label: string }>;
