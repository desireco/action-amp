/**
 * Format a duration in milliseconds as a compact human label.
 *
 *   <1h   → "N min"            (e.g. 12 min, 45 min)
 *   ≥1h   → "Nh Mm"            (e.g. 1h 5m, 2h 40m, dropping minutes if 0: "3h")
 *   0     → "0 min"
 *
 * Used by the focus clock's session + total. Negative input clamps to 0
 * (clock skew shouldn't render "-1 min").
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}
