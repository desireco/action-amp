export type ProjectCandidate = {
  id: string;
  name: string;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function projectNamePattern(name: string): RegExp {
  return new RegExp(`(^|\\s)${escapeRegex(name)}(?=$|\\s|[.,!?;:])`, "i");
}

export function resolveProjectCandidate<T extends ProjectCandidate>(
  projects: readonly T[],
  item: { parsedProject?: string | null; text?: string | null },
): T | null {
  const hint = item.parsedProject?.trim();
  if (hint) {
    return projects.find((p) => p.name.toLowerCase() === hint.toLowerCase()) ?? null;
  }

  const text = item.text ?? "";
  if (!text.trim()) return null;

  const matches = projects.filter((p) => {
    const name = p.name.trim();
    if (!name) return false;
    return projectNamePattern(name).test(text);
  });
  if (matches.length === 0) return null;

  return [...matches].sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}
