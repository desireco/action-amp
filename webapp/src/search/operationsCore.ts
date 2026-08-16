/**
 * Pure sitewide-search core. Wasp wrapper owns auth + entitlement; this module
 * owns tenant-scoped database reads, shaping, ranking, snippets, and limits.
 */

// Prisma delegates from Wasp context or Vitest spies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entities = Record<string, any>;

export type SearchResultKind =
  "task" | "project" | "goal" | "resource" | "inbox";
export type SearchMatchedField = "title" | "body" | "outcome" | "note" | "url";
export type SearchResultState =
  | "active"
  | "today"
  | "upcoming"
  | "someday"
  | "done"
  | "wont-do"
  | "inbox"
  | "archived";

export type SearchSiteResult = {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  matchedField: SearchMatchedField;
  href: string;
  lens: { id: string; name: string; color: string | null } | null;
  state: SearchResultState;
};

export type SearchSiteResponse = {
  query: string;
  results: SearchSiteResult[];
  truncated: boolean;
};

export type CommandIndexKind = SearchResultKind | "lens";

export type CommandIndexItem = {
  id: string;
  kind: CommandIndexKind;
  title: string;
  subtitle: string | null;
  href: string | null;
  aliases: string[];
  lensColor?: string | null;
  occurredAt?: Date | null;
};

export type CommandPaletteIndexResponse = {
  items: CommandIndexItem[];
};

type RankedResult = SearchSiteResult & {
  score: number;
  sortDate: Date;
};

interface SearchableField {
  field: SearchMatchedField;
  value: string | null | undefined;
}

const TOTAL_LIMIT = 30;
const KIND_LIMIT = 10;
const PASS_LIMIT = KIND_LIMIT + 1;
const SNIPPET_LIMIT = 140;
const KIND_ORDER: Record<SearchResultKind, number> = {
  task: 0,
  project: 1,
  goal: 2,
  resource: 3,
  inbox: 4,
};

export function normalizeSearchQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function searchQueryError(value: string): string | null {
  const query = normalizeSearchQuery(value);
  if (query.length < 2) return "Search query must be at least 2 characters.";
  if (query.length > 100) return "Search query must be at most 100 characters.";
  return null;
}

function contains(value: string | null | undefined, token: string): boolean {
  return Boolean(value?.toLocaleLowerCase().includes(token));
}

function containsEvery(
  value: string | null | undefined,
  tokens: string[],
): boolean {
  return tokens.every((token) => contains(value, token));
}

function searchableWhere(tokens: string[], fields: string[]) {
  return tokens.map((token) => ({
    OR: fields.map((field) => ({
      [field]: { contains: token, mode: "insensitive" },
    })),
  }));
}

function taskWhere(tokens: string[], userId: string) {
  return tokens.map((token) => ({
    OR: [
      { description: { contains: token, mode: "insensitive" } },
      { content: { contains: token, mode: "insensitive" } },
      { outcome: { contains: token, mode: "insensitive" } },
      {
        updates: {
          some: {
            userId,
            kind: "NOTE",
            body: { contains: token, mode: "insensitive" },
          },
        },
      },
    ],
  }));
}

type BoundedRows = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  truncated: boolean;
};

/**
 * Prisma cannot order a heterogeneous multi-field match by relevance. Keep the
 * read bounded without losing an old exact/prefix title behind newer body
 * matches: probe exact title, prefix title, then the broader all-field match.
 * Each pass requests one sentinel row beyond the public per-kind cap.
 */
async function fetchBoundedRows({
  delegate,
  userId,
  query,
  titleFields,
  broadAnd,
  select,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delegate: any;
  userId: string;
  query: string;
  titleFields: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  broadAnd: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
}): Promise<BoundedRows> {
  const titleWhere = (operator: "equals" | "startsWith") => ({
    userId,
    OR: titleFields.map((field) => ({
      [field]: { [operator]: query, mode: "insensitive" },
    })),
  });
  const args = (where: object) => ({
    where,
    orderBy: { createdAt: "desc" },
    take: PASS_LIMIT,
    select,
  });
  const passes = await Promise.all([
    delegate.findMany(args(titleWhere("equals"))),
    delegate.findMany(args(titleWhere("startsWith"))),
    delegate.findMany(args({ userId, AND: broadAnd })),
  ]);
  const truncated = passes.some((rows) => rows.length >= PASS_LIMIT);
  const byId = new Map<string, (typeof passes)[number][number]>();
  for (const rows of passes) {
    for (const row of rows.slice(0, PASS_LIMIT)) byId.set(row.id, row);
  }
  return { rows: [...byId.values()], truncated };
}

function titleScore(title: string, query: string, tokens: string[]): number {
  const normalized = title.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (tokens.every((token) => normalized.includes(token))) return 2;
  if (normalized.includes(query)) return 3;
  return 4;
}

function firstMatchedField(
  fields: SearchableField[],
  tokens: string[],
): SearchableField {
  return (
    fields.find(({ value }) =>
      tokens.some((token) => contains(value, token)),
    ) ?? {
      field: "title",
      value: null,
    }
  );
}

function makeSnippet(
  value: string | null | undefined,
  tokens: string[],
): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const lower = normalized.toLocaleLowerCase();
  const indexes = tokens
    .map((token) => lower.indexOf(token))
    .filter((index) => index >= 0);
  const matchAt = indexes.length > 0 ? Math.min(...indexes) : 0;
  const windowStart = Math.max(0, matchAt - 48);
  const raw = normalized.slice(windowStart, windowStart + SNIPPET_LIMIT);
  return `${windowStart > 0 ? "…" : ""}${raw}${windowStart + raw.length < normalized.length ? "…" : ""}`;
}

function statePenalty(state: SearchResultState): number {
  return state === "done" || state === "wont-do" || state === "archived"
    ? 1
    : 0;
}

function compareResults(a: RankedResult, b: RankedResult): number {
  return (
    a.score - b.score ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    statePenalty(a.state) - statePenalty(b.state) ||
    b.sortDate.getTime() - a.sortDate.getTime() ||
    a.id.localeCompare(b.id)
  );
}

function taskState(row: {
  isDone: boolean;
  status: string;
}): SearchResultState {
  if (row.isDone) return "done";
  if (row.status === "WONT_DO") return "wont-do";
  if (row.status === "TODAY") return "today";
  if (row.status === "UPCOMING") return "upcoming";
  return "someday";
}

function displayTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 100 ? normalized : `${normalized.slice(0, 99)}…`;
}

export async function searchSiteData(
  entities: Entities,
  { userId, query: rawQuery }: { userId: string; query: string },
): Promise<SearchSiteResponse> {
  const query = normalizeSearchQuery(rawQuery);
  const tokens = query.toLocaleLowerCase().split(" ");
  const noteOr = tokens.map((token) => ({
    body: { contains: token, mode: "insensitive" },
  }));

  const [taskRead, projectRead, goalRead, resourceRead, inboxRead] =
    await Promise.all([
      fetchBoundedRows({
        delegate: entities.Task,
        userId,
        query,
        titleFields: ["description"],
        broadAnd: taskWhere(tokens, userId),
        select: {
          id: true,
          description: true,
          permalink: true,
          content: true,
          outcome: true,
          isDone: true,
          status: true,
          createdAt: true,
          lens: { select: { id: true, name: true, color: true } },
          project: { select: { name: true } },
          updates: {
            where: { userId, kind: "NOTE", OR: noteOr },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { body: true },
          },
        },
      }),
      fetchBoundedRows({
        delegate: entities.Project,
        userId,
        query,
        titleFields: ["name"],
        broadAnd: searchableWhere(tokens, ["name", "description"]),
        select: {
          id: true,
          name: true,
          permalink: true,
          description: true,
          isDone: true,
          createdAt: true,
          lens: { select: { id: true, name: true, color: true } },
          goal: { select: { name: true } },
        },
      }),
      fetchBoundedRows({
        delegate: entities.Goal,
        userId,
        query,
        titleFields: ["name"],
        broadAnd: searchableWhere(tokens, ["name", "description"]),
        select: {
          id: true,
          name: true,
          permalink: true,
          description: true,
          isDone: true,
          createdAt: true,
          lens: { select: { id: true, name: true, color: true } },
        },
      }),
      fetchBoundedRows({
        delegate: entities.Resource,
        userId,
        query,
        titleFields: ["title"],
        broadAnd: searchableWhere(tokens, ["title", "notes", "url"]),
        select: {
          id: true,
          title: true,
          notes: true,
          url: true,
          createdAt: true,
          project: {
            select: {
              name: true,
              permalink: true,
              isDone: true,
              lens: { select: { id: true, name: true, color: true } },
            },
          },
        },
      }),
      fetchBoundedRows({
        delegate: entities.InboxItem,
        userId,
        query,
        titleFields: ["title", "text"],
        broadAnd: searchableWhere(tokens, [
          "text",
          "title",
          "content",
          "sourceUrl",
        ]),
        select: {
          id: true,
          text: true,
          title: true,
          content: true,
          sourceUrl: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);
  const tasks = taskRead.rows;
  const projects = projectRead.rows;
  const goals = goalRead.rows;
  const resources = resourceRead.rows;
  const inboxItems = inboxRead.rows;

  const ranked: RankedResult[] = [];

  for (const row of tasks) {
    const note = row.updates
      .map((update: { body: string }) => update.body)
      .join(" ");
    const bodyFields: SearchableField[] = [
      { field: "body", value: row.content },
      { field: "outcome", value: row.outcome },
      { field: "note", value: note },
    ];
    const matched = containsEvery(row.description, tokens)
      ? { field: "title" as const, value: row.description }
      : firstMatchedField(bodyFields, tokens);
    const state = taskState(row);
    ranked.push({
      id: row.id,
      kind: "task",
      title: row.description,
      subtitle: row.project?.name ?? null,
      snippet:
        matched.field === "title"
          ? makeSnippet(row.content, tokens)
          : makeSnippet(matched.value, tokens),
      matchedField: matched.field,
      href: `/do/tasks/${encodeURIComponent(row.permalink)}`,
      lens: row.lens,
      state,
      score: titleScore(row.description, query.toLocaleLowerCase(), tokens),
      sortDate: new Date(row.createdAt),
    });
  }

  for (const row of projects) {
    const matched = containsEvery(row.name, tokens)
      ? { field: "title" as const, value: row.name }
      : firstMatchedField([{ field: "body", value: row.description }], tokens);
    ranked.push({
      id: row.id,
      kind: "project",
      title: row.name,
      subtitle: row.goal?.name ?? null,
      snippet:
        matched.field === "title" ? null : makeSnippet(matched.value, tokens),
      matchedField: matched.field,
      href: `/do/projects/${encodeURIComponent(row.permalink)}`,
      lens: row.lens,
      state: row.isDone ? "done" : "active",
      score: titleScore(row.name, query.toLocaleLowerCase(), tokens),
      sortDate: new Date(row.createdAt),
    });
  }

  for (const row of goals) {
    const matched = containsEvery(row.name, tokens)
      ? { field: "title" as const, value: row.name }
      : firstMatchedField([{ field: "body", value: row.description }], tokens);
    ranked.push({
      id: row.id,
      kind: "goal",
      title: row.name,
      subtitle: null,
      snippet:
        matched.field === "title" ? null : makeSnippet(matched.value, tokens),
      matchedField: matched.field,
      href: `/do/goals/${encodeURIComponent(row.permalink)}`,
      lens: row.lens,
      state: row.isDone ? "done" : "active",
      score: titleScore(row.name, query.toLocaleLowerCase(), tokens),
      sortDate: new Date(row.createdAt),
    });
  }

  for (const row of resources) {
    const matched = containsEvery(row.title, tokens)
      ? { field: "title" as const, value: row.title }
      : firstMatchedField(
          [
            { field: "body", value: row.notes },
            { field: "url", value: row.url },
          ],
          tokens,
        );
    ranked.push({
      id: row.id,
      kind: "resource",
      title: row.title,
      subtitle: row.project.name,
      snippet:
        matched.field === "title" ? null : makeSnippet(matched.value, tokens),
      matchedField: matched.field,
      href: `/do/projects/${encodeURIComponent(row.project.permalink)}#resource-${encodeURIComponent(row.id)}`,
      lens: row.project.lens,
      state: row.project.isDone ? "done" : "active",
      score: titleScore(row.title, query.toLocaleLowerCase(), tokens),
      sortDate: new Date(row.createdAt),
    });
  }

  for (const row of inboxItems) {
    const title = displayTitle(row.title?.trim() || row.text);
    const matched = containsEvery(title, tokens)
      ? { field: "title" as const, value: title }
      : firstMatchedField(
          [
            { field: "body", value: row.text },
            { field: "body", value: row.content },
            { field: "url", value: row.sourceUrl },
          ],
          tokens,
        );
    const archived = row.status === "ARCHIVED";
    ranked.push({
      id: row.id,
      kind: "inbox",
      title,
      subtitle: null,
      snippet:
        matched.field === "title"
          ? makeSnippet(row.content, tokens)
          : makeSnippet(matched.value, tokens),
      matchedField: matched.field,
      href: archived
        ? `/do/logbook?item=${encodeURIComponent(row.id)}`
        : `/do/inbox?item=${encodeURIComponent(row.id)}`,
      lens: null,
      state: archived ? "archived" : "inbox",
      score: titleScore(title, query.toLocaleLowerCase(), tokens),
      sortDate: new Date(row.createdAt),
    });
  }

  ranked.sort(compareResults);
  const counts = new Map<SearchResultKind, number>();
  const results: SearchSiteResult[] = [];
  for (const { score: _score, sortDate: _sortDate, ...result } of ranked) {
    if (results.length >= TOTAL_LIMIT) break;
    const count = counts.get(result.kind) ?? 0;
    if (count >= KIND_LIMIT) continue;
    counts.set(result.kind, count + 1);
    results.push(result);
  }

  return {
    query,
    results,
    truncated:
      results.length < ranked.length ||
      taskRead.truncated ||
      projectRead.truncated ||
      goalRead.truncated ||
      resourceRead.truncated ||
      inboxRead.truncated,
  };
}

/** Compact title-only index for instant client fuzzy matching. */
export async function getCommandPaletteIndexData(
  entities: Entities,
  { userId }: { userId: string },
): Promise<CommandPaletteIndexResponse> {
  const [tasks, projects, goals, resources, inboxItems, lenses] =
    await Promise.all([
      entities.Task.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          description: true,
          permalink: true,
          status: true,
          isDone: true,
          project: { select: { name: true } },
          lens: { select: { name: true, color: true } },
        },
      }),
      entities.Project.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          permalink: true,
          isDone: true,
          lens: { select: { name: true, color: true } },
        },
      }),
      entities.Goal.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          permalink: true,
          isDone: true,
          lens: { select: { name: true, color: true } },
        },
      }),
      entities.Resource.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          project: {
            select: {
              name: true,
              permalink: true,
              lens: { select: { name: true, color: true } },
            },
          },
        },
      }),
      entities.InboxItem.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          text: true,
          status: true,
          createdAt: true,
          archivedAt: true,
        },
      }),
      entities.Lens.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, color: true },
      }),
    ]);

  return {
    items: [
      ...tasks.map((row: any) => ({
        id: row.id,
        kind: "task" as const,
        title: row.description,
        subtitle: row.project?.name ?? row.lens.name,
        href: `/do/tasks/${encodeURIComponent(row.permalink)}`,
        aliases: [
          row.status.toLocaleLowerCase(),
          row.isDone ? "done" : "task",
          row.project?.name,
          row.lens.name,
        ].filter(Boolean),
        lensColor: row.lens.color,
      })),
      ...projects.map((row: any) => ({
        id: row.id,
        kind: "project" as const,
        title: row.name,
        subtitle: row.lens.name,
        href: `/do/projects/${encodeURIComponent(row.permalink)}`,
        aliases: [row.isDone ? "done" : "active", "project", row.lens.name],
        lensColor: row.lens.color,
      })),
      ...goals.map((row: any) => ({
        id: row.id,
        kind: "goal" as const,
        title: row.name,
        subtitle: row.lens.name,
        href: `/do/goals/${encodeURIComponent(row.permalink)}`,
        aliases: [row.isDone ? "done" : "active", "goal", row.lens.name],
        lensColor: row.lens.color,
      })),
      ...resources.map((row: any) => ({
        id: row.id,
        kind: "resource" as const,
        title: row.title,
        subtitle: row.project.name,
        href: `/do/projects/${encodeURIComponent(row.project.permalink)}#resource-${encodeURIComponent(row.id)}`,
        aliases: [
          "resource",
          "reference",
          row.project.name,
          row.project.lens.name,
        ],
        lensColor: row.project.lens.color,
      })),
      ...inboxItems.map((row: any) => {
        const archived = row.status === "ARCHIVED";
        return {
          id: row.id,
          kind: "inbox" as const,
          title: displayTitle(row.title?.trim() || row.text),
          subtitle: archived ? "Logbook" : "Inbox",
          href: archived
            ? `/do/logbook?item=${encodeURIComponent(row.id)}`
            : `/do/inbox?item=${encodeURIComponent(row.id)}`,
          aliases: [archived ? "archived" : "inbox", "note"],
          occurredAt: archived ? row.archivedAt : row.createdAt,
        };
      }),
      ...lenses.map((row: any) => ({
        id: row.id,
        kind: "lens" as const,
        title: row.name,
        subtitle: "Switch lens",
        href: null,
        aliases: ["lens", "switch context"],
        lensColor: row.color,
      })),
    ],
  };
}
