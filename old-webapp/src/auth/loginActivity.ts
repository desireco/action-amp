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
  User: {
    update: (args: {
      where: { id: string };
      data: { lastLoginAt?: Date };
    }) => Promise<{ id: string }>;
  };
  LoginEvent: {
    create: (args: {
      data: { userId: string; provider: LoginProvider; createdAt?: Date };
    }) => Promise<{ id: string }>;
  };
};

const KNOWN_PROVIDERS = new Set<string>([
  "magic",
  "email",
  "google",
  "github",
  "discord",
  "slack",
  "keycloak",
  "microsoft",
  "username",
  "other",
]);

function isLoginProvider(value: string): value is LoginProvider {
  return KNOWN_PROVIDERS.has(value);
}

export function boundedLoginProvider(provider: string): LoginProvider {
  return isLoginProvider(provider) ? provider : "other";
}

/** Record a successful login only; callers own authentication/session success. */
export async function recordLoginActivity(
  entities: LoginActivityEntities,
  userId: string,
  provider: string,
): Promise<void> {
  const now = new Date();
  await Promise.all([
    entities.User.update({ where: { id: userId }, data: { lastLoginAt: now } }),
    entities.LoginEvent.create({
      data: {
        userId,
        provider: boundedLoginProvider(provider),
        createdAt: now,
      },
    }),
  ]);
}

/** Never turn a successful session into an auth failure because logging failed. */
export async function recordLoginActivitySafely(
  entities: LoginActivityEntities,
  userId: string,
  provider: string,
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
