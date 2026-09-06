const MAX_MESSAGE_LENGTH = 1_000;
const MAX_STACK_LENGTH = 12_000;

const SECRET_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]"],
  [
    /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
    "[redacted-token]",
  ],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]"],
  [/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, "$1[redacted]@"],
];

/**
 * Error telemetry must stay operational: no identity, credentials, or URL
 * query strings. The result is also bounded so a recursive/huge error cannot
 * flood the log stream.
 */
export function sanitizeErrorText(
  value: string,
  maxLength = MAX_MESSAGE_LENGTH,
): string {
  let text = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  text = text.replace(/(https?:\/\/[^\s?#]+)[?#][^\s)\]}]+/gi, "$1?[redacted]");
  return text.slice(0, maxLength);
}

export function sanitizeStack(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return sanitizeErrorText(value, MAX_STACK_LENGTH);
}

export function safePath(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/unknown";
  const path = value.split(/[?#]/, 1)[0].slice(0, 300) || "/";
  return path
    .replace(/^\/do\/(today|goals|tasks|projects)\/[^/]+/, "/do/$1/:item")
    .replace(/^\/api\/(attachments|cli\/attachment)\/[^/]+/, "/api/$1/:item");
}
