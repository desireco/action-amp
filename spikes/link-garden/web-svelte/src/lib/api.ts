import { createRouterClient } from "typebase-io/client";
import type { Router } from "../../../api/typebase/_generated/server";

// Same-origin via the vite dev proxy (see vite.config.ts): the bundle's
// better-auth 404s CORS preflights and rejects non-JSON content types, so
// direct cross-origin browser auth is broken at typebase 0.1.15. The proxy
// still targets the separate Typebase service — this is a dev-transport
// detail, not a backend coupling.
const API_URL = typeof location !== "undefined" ? location.origin : "";

export const client = createRouterClient<Router>({
  url: API_URL,
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export type Link = Awaited<ReturnType<typeof client.links.list>>[number];
export type LinkStatus = Link["status"];
export type SessionUser = { id: string; name: string; email: string };

async function authPost(path: string, body: unknown) {
  const response = await fetch(`${API_URL}/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as
      | { code?: string; message?: string }
      | null;
    throw new Error(detail?.message ?? detail?.code ?? `auth failed (${response.status})`);
  }
  return response.json();
}

export const signUp = (name: string, email: string, password: string) =>
  authPost("sign-up/email", { name, email, password });

export const signIn = (email: string, password: string) =>
  authPost("sign-in/email", { email, password });

export async function getSessionUser(): Promise<SessionUser | null> {
  const response = await fetch(`${API_URL}/api/auth/get-session`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { user?: SessionUser };
  return data.user ?? null;
}
