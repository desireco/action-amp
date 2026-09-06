/**
 * JSON-value contract + primitive tests — boundary-parse helpers for API
 * handlers that decode request bodies (analytics/eventApi, share/shareCapture;
 * auth/patRoutes carries its own local copy from an earlier pass).
 *
 * JSON.parse and the body parsers only ever produce primitive strings /
 * numbers / booleans (never boxed), so constructor identity is an exact type
 * test — no `typeof` probing.
 */

/** A JSON value as JSON.parse / express.json produces it (concrete arms only). */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Exact primitive-string test for JSON-parsed values. */
export function isJsonString(value: JsonValue | undefined): value is string {
  return value?.constructor === String;
}

/** Exact primitive-number test for JSON-parsed values. */
export function isJsonNumber(value: JsonValue | undefined): value is number {
  return value?.constructor === Number;
}

/** Exact primitive-boolean test for JSON-parsed values. */
export function isJsonBoolean(value: JsonValue | undefined): value is boolean {
  return value?.constructor === Boolean;
}
