// Ported from webapp/src/shared/permalinks.ts (F4b) — pure, entity-free.
//
// Why it is here: the tasks core itself only READS permalinks (Task.permalink
// arrives with the row); the minting lives in the create paths —
// `createTaskCore` (webapp/src/projects/operationsCore.ts, a future port)
// calls `uniquePermalink(taskPermalinkSource(description, projectPermalink),
// exists)` with collision-retried numeric suffixes against the
// `Task(userId, permalink)` unique. When that core ports, it calls these same
// helpers against the Drizzle seam — do not re-implement the slug math.
const FALLBACK = "item";

function permalinkBase(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");

  return slug || FALLBACK;
}

export async function uniquePermalink(
  name: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = permalinkBase(name);
  let candidate = base;
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export function taskPermalinkSource(
  description: string,
  projectPermalink?: string | null,
): string {
  return projectPermalink ? `${projectPermalink}-${description}` : description;
}
