export type LoginProvider =
  | "magic"
  | "email"
  | "google"
  | "github"
  | "discord"
  | "slack"
  | "keycloak"
  | "microsoft"
  | "username"
  | "other";

type LoginActivityEntities = {
  User: { update: (...args: any[]) => Promise<unknown> };
  LoginEvent: { create: (...args: any[]) => Promise<unknown> };
};

const KNOWN_PROVIDERS = new Set<LoginProvider>([
  "magic", "email", "google", "github", "discord", "slack", "keycloak", "microsoft", "username", "other",
]);

export function boundedLoginProvider(provider: unknown): LoginProvider {
  return typeof provider === "string" && KNOWN_PROVIDERS.has(provider as LoginProvider)
    ? provider as LoginProvider
    : "other";
}

/** Record a successful login only; callers own authentication/session success. */
export async function recordLoginActivity(
  entities: LoginActivityEntities,
  userId: string,
  provider: unknown,
): Promise<void> {
  const now = new Date();
  await Promise.all([
    entities.User.update({ where: { id: userId }, data: { lastLoginAt: now } }),
    entities.LoginEvent.create({ data: { userId, provider: boundedLoginProvider(provider), createdAt: now } }),
  ]);
}

/** Never turn a successful session into an auth failure because logging failed. */
export async function recordLoginActivitySafely(
  entities: LoginActivityEntities,
  userId: string,
  provider: unknown,
): Promise<void> {
  try {
    await recordLoginActivity(entities, userId, provider);
  } catch (error) {
    console.error("Login activity recording failed", {
      userId,
      provider: boundedLoginProvider(provider),
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
