/**
 * Short id generator for human-addressable entity ids (e.g. feedback triage).
 *
 * 8 random chars from the Crockford base32 alphabet (0-9, A-Z excluding I, L,
 * O, U), formatted as two 4-char groups: `XXXX-XXXX`. ~30 bits of entropy —
 * fine for low-volume entities where uniqueness is enforced by a retry loop +
 * a DB unique constraint, not by the id alone. Case-insensitive on lookup
 * (Crockford is designed for it: ambiguous chars map canonically).
 *
 * Mirrors the permalinks.ts pattern: the caller passes an `exists` predicate
 * so the generator retries on collision without depending on a specific entity
 * delegate. The DB `@unique` constraint is the backstop if two callers race.
 */

// Crockford base32: omits I, L, O, U to minimize misreads.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXZ";
const GROUP_LEN = 4;
const ID_LEN = 8;

/** Generate one random 8-char Crockford-base32 id (no dash). */
function rawId(): string {
  let out = "";
  for (let i = 0; i < ID_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** Format an 8-char id as `XXXX-XXXX`. Pass through if already 8 chars. */
function formatShortId(raw: string): string {
  const clean = raw.replace(/-/g, "").toUpperCase().slice(0, ID_LEN);
  return `${clean.slice(0, GROUP_LEN)}-${clean.slice(GROUP_LEN)}`;
}

/**
 * Mint a unique short id, retrying on collision. The `exists` predicate should
 * return true if the candidate is already taken (case-insensitive — compare
 * against the uppercased form stored in the DB).
 */
export async function uniqueShortId(
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  // Practically never loops (30 bits, low row counts); the loop + unique
  // constraint make collisions impossible to persist.
  for (;;) {
    const candidate = formatShortId(rawId());
    if (!(await exists(candidate))) return candidate;
  }
}

/**
 * Normalize an inbound id to the stored uppercased form for lookup. Strips
 * dashes, uppercases, maps ambiguous chars per Crockford (0→O, 1→I/L,
 * etc.) so a user who mistypes still resolves. Returns null if the input
 * isn't a plausible 8-char id (so callers can fall back to treating it as
 * a UUID).
 */
function normalizeShortId(input: string): string | null {
  const stripped = input.replace(/-/g, "").toUpperCase();
  if (stripped.length !== ID_LEN) return null;
  // Crockford canonicalization: map confusable input back to the alphabet.
  const canonical = stripped
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
  if (![...canonical].every((c) => ALPHABET.includes(c))) return null;
  return formatShortId(canonical);
}
