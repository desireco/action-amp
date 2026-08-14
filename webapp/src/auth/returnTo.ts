export const DEFAULT_AUTH_RETURN_TO = "/do";

const RETURN_TO_BASE = "https://actionamp.local";

/**
 * Accept only same-origin paths as post-auth destinations. Besides blocking
 * absolute URLs, the origin comparison catches protocol-relative and
 * backslash-based URLs that browsers can interpret as another host.
 */
export function safeAuthReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return DEFAULT_AUTH_RETURN_TO;
  }

  try {
    const url = new URL(value, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return DEFAULT_AUTH_RETURN_TO;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_AUTH_RETURN_TO;
  }
}

export function buildMagicLoginUrl(
  baseUrl: string,
  token: string,
  returnTo: unknown,
): string {
  const url = new URL("/login", baseUrl);
  url.searchParams.set("magic", token);
  url.searchParams.set("returnTo", safeAuthReturnTo(returnTo));
  return url.toString();
}
