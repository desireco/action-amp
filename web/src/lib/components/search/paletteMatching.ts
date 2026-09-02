import Fuse from "fuse.js";

export type SearchablePaletteEntry<T = unknown> = {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  kindOrder: number;
  serverResult: boolean;
  payload: T;
};

export function matchPaletteEntries<T>(
  entries: SearchablePaletteEntry<T>[],
  rawQuery: string,
  limit = 30,
): SearchablePaletteEntry<T>[] {
  const query = rawQuery.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (!query) return entries.slice(0, limit);

  const unique = [
    ...new Map(entries.map((entry) => [entry.id, entry])).values(),
  ];
  const exact = unique.filter(
    (entry) => entry.title.toLocaleLowerCase() === query,
  );
  const exactIds = new Set(exact.map((entry) => entry.id));
  const prefix = unique.filter(
    (entry) =>
      !exactIds.has(entry.id) &&
      entry.title.toLocaleLowerCase().startsWith(query),
  );
  const used = new Set([...exactIds, ...prefix.map((entry) => entry.id)]);
  const sortStable = (
    a: SearchablePaletteEntry<T>,
    b: SearchablePaletteEntry<T>,
  ) =>
    a.kindOrder - b.kindOrder ||
    a.title.localeCompare(b.title) ||
    a.id.localeCompare(b.id);
  const fuse = new Fuse(
    unique.filter((entry) => !used.has(entry.id)),
    {
      keys: [
        { name: "title", weight: 0.7 },
        { name: "aliases", weight: 0.2 },
        { name: "subtitle", weight: 0.1 },
      ],
      threshold: 0.38,
      ignoreLocation: true,
      includeScore: true,
    },
  );
  const fuzzy = fuse
    .search(query)
    .sort(
      (a, b) => (a.score ?? 1) - (b.score ?? 1) || sortStable(a.item, b.item),
    )
    .map(({ item }) => item);
  const fuzzyIds = new Set(fuzzy.map((entry) => entry.id));
  const serverBodyMatches = unique.filter(
    (entry) =>
      entry.serverResult && !used.has(entry.id) && !fuzzyIds.has(entry.id),
  );
  return [
    ...exact.sort(sortStable),
    ...prefix.sort(sortStable),
    ...fuzzy,
    ...serverBodyMatches.sort(sortStable),
  ].slice(0, limit);
}
