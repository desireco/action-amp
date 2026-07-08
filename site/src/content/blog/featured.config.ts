/**
 * Featured zone — build-time configuration.
 *
 * The featured zone sits between the hero and the two lanes. It renders exactly
 * one pattern (A = Spotlight, B = Split) per build, and curates which published
 * posts fill which slots. Items curated here are deduplicated out of the lanes.
 *
 * Pattern selection is a single build-time value — there is NO client-side
 * rotation or carousel (that would violate the calm rule). The active pattern
 * is date-based by default (even/odd ISO week), which gives a quiet rotation
 * cadence across publishes with no editor intervention. Override `pattern` below
 * to pin a specific pattern for a release.
 *
 * Spec: docs/specs/blog.md (Design decisions locked §5–§6, Done-conditions §Featured).
 */

export type FeaturedPattern = "A" | "B";

export interface FeaturedConfig {
  /** Which pattern to render. When null, derived from the current ISO week. */
  pattern: FeaturedPattern | null;
  /**
   * Curated slot assignments by slug. An item assigned to "hero" takes the
   * full-width slot in Pattern A; "take" items fill the smaller slots in
   * either pattern. Items not listed but marked `featured: true` in their
   * frontmatter are still pulled out of the lanes — the renderer places them
   * into spare featured slots by kind.
   */
  slots: Record<string, "hero" | "take">;
}

export const featuredConfig: FeaturedConfig = {
  // null = date-based rotation (even ISO week → A, odd → B).
  // Pin to "A" or "B" to override for a release.
  pattern: null,
  slots: {
    "why-the-list-is-the-problem": "hero",
    "a-calm-gtd-setup-in-15-minutes": "take",
    "andy-matuschak-notes": "take",
    "how-tiimo-handles-single-task-focus": "take",
    "founding-100": "take",
  },
};

/**
 * Resolve the active pattern for this build. Editor-set value wins; otherwise
 * the ISO week number decides (even → A, odd → B). Exposed for the renderer
 * and for tests; deterministic for a given build date.
 */
export function resolvePattern(
  cfg: FeaturedConfig = featuredConfig,
  now: Date = new Date(),
): FeaturedPattern {
  if (cfg.pattern) return cfg.pattern;
  // ISO 8601 week number via UTC to stay timezone-stable across build envs.
  const date = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const thursday = date + 3 - ((date + 6) % 7); // the Thursday of this ISO week
  const jan1 = Date.UTC(new Date(thursday).getUTCFullYear(), 0, 1);
  const isoWeek = Math.ceil(((thursday - jan1) / 86400000 + 1) / 7);
  return isoWeek % 2 === 0 ? "A" : "B";
}
