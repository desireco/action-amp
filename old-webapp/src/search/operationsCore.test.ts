import { describe, expect, it, vi } from "vitest";
import {
  getCommandPaletteIndexData,
  normalizeSearchQuery,
  searchQueryError,
  searchSiteData,
} from "./operationsCore";

function entities() {
  return {
    Task: { findMany: vi.fn().mockResolvedValue([]) },
    Project: { findMany: vi.fn().mockResolvedValue([]) },
    Goal: { findMany: vi.fn().mockResolvedValue([]) },
    Resource: { findMany: vi.fn().mockResolvedValue([]) },
    InboxItem: { findMany: vi.fn().mockResolvedValue([]) },
    Lens: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

const LENS = { id: "lens-1", name: "Work", color: "indigo" };

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    description: "Renew insurance",
    permalink: "renew-insurance",
    content: "Check renewal terms before Friday",
    outcome: null,
    isDone: false,
    status: "UPCOMING",
    createdAt: new Date("2026-08-01"),
    lens: LENS,
    project: { name: "Operations" },
    updates: [],
    ...overrides,
  };
}

function project(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: `project-${index}`,
    name: `Renewal project ${index}`,
    permalink: `renewal-project-${index}`,
    description: null,
    isDone: false,
    createdAt: new Date(2026, 7, index),
    lens: LENS,
    goal: null,
    ...overrides,
  };
}

describe("search query normalization", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearchQuery("  vendor\n  renewal ")).toBe("vendor renewal");
  });

  it("enforces the 2–100 character boundary", () => {
    expect(searchQueryError("x")).toMatch(/at least 2/);
    expect(searchQueryError("xx")).toBeNull();
    expect(searchQueryError("x".repeat(100))).toBeNull();
    expect(searchQueryError("x".repeat(101))).toMatch(/at most 100/);
    expect(searchQueryError("renewal")).toBeNull();
  });
});

describe("searchSiteData", () => {
  it("scopes every entity and nested task-note match to the user", async () => {
    const db = entities();
    await searchSiteData(db, { userId: "user-1", query: "vendor renewal" });

    for (const entity of [
      db.Task,
      db.Project,
      db.Goal,
      db.Resource,
      db.InboxItem,
    ]) {
      for (const [args] of entity.findMany.mock.calls) {
        expect(args.where.userId).toBe("user-1");
        expect(args.take).toBe(11);
      }
    }
    const taskArgs = db.Task.findMany.mock.calls[2][0];
    expect(taskArgs.where.AND).toHaveLength(2);
    expect(taskArgs.where.AND[0].OR[3].updates.some).toMatchObject({
      userId: "user-1",
      kind: "NOTE",
    });
    expect(taskArgs.select.updates.where).toMatchObject({
      userId: "user-1",
      kind: "NOTE",
    });
    expect(JSON.stringify(taskArgs.where)).toContain("description");
    expect(JSON.stringify(taskArgs.where)).toContain("content");
    expect(JSON.stringify(taskArgs.where)).toContain("outcome");
    expect(JSON.stringify(taskArgs.where)).toContain("updates");
    expect(
      JSON.stringify(db.Project.findMany.mock.calls[2][0].where),
    ).toContain("description");
    expect(JSON.stringify(db.Goal.findMany.mock.calls[2][0].where)).toContain(
      "description",
    );
    const resourceWhere = JSON.stringify(
      db.Resource.findMany.mock.calls[2][0].where,
    );
    expect(resourceWhere).toContain("title");
    expect(resourceWhere).toContain("notes");
    expect(resourceWhere).toContain("url");
    const inboxWhere = JSON.stringify(
      db.InboxItem.findMany.mock.calls[2][0].where,
    );
    for (const field of ["text", "title", "content", "sourceUrl"]) {
      expect(inboxWhere).toContain(field);
    }
  });

  it("maps every named task lifecycle plus Inbox and Archived", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([
      task({ id: "today", status: "TODAY" }),
      task({ id: "upcoming", status: "UPCOMING" }),
      task({ id: "someday", status: "SOMEDAY" }),
      task({ id: "wont", status: "WONT_DO" }),
      task({ id: "done", status: "TODAY", isDone: true }),
    ]);
    db.InboxItem.findMany.mockResolvedValue([
      {
        id: "live",
        text: "Renew live",
        title: null,
        content: null,
        sourceUrl: null,
        status: "UNPROCESSED",
        createdAt: new Date("2026-08-01"),
      },
      {
        id: "archived",
        text: "Renew archived",
        title: null,
        content: null,
        sourceUrl: null,
        status: "ARCHIVED",
        createdAt: new Date("2026-08-01"),
      },
    ]);

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renew",
    });
    expect(
      Object.fromEntries(response.results.map((item) => [item.id, item.state])),
    ).toMatchObject({
      today: "today",
      upcoming: "upcoming",
      someday: "someday",
      wont: "wont-do",
      done: "done",
      live: "inbox",
      archived: "archived",
    });
  });

  it("shapes all result kinds, lifecycle states, and useful destinations", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([
      task({
        description: "Insurance task",
        content: null,
        updates: [{ body: "Vendor renewal is next week" }],
        status: "WONT_DO",
      }),
    ]);
    db.Project.findMany.mockResolvedValue([
      project(1, {
        name: "Vendor project",
        description: "Annual renewal",
        isDone: true,
      }),
    ]);
    db.Goal.findMany.mockResolvedValue([
      {
        id: "goal-1",
        name: "Vendor stability",
        permalink: "vendor-stability",
        description: "Renewal coverage",
        isDone: false,
        createdAt: new Date("2026-08-02"),
        lens: LENS,
      },
    ]);
    db.Resource.findMany.mockResolvedValue([
      {
        id: "resource-1",
        title: "Vendor policy",
        notes: "Renewal window",
        url: null,
        createdAt: new Date("2026-08-03"),
        project: {
          name: "Operations",
          permalink: "operations",
          isDone: false,
          lens: LENS,
        },
      },
    ]);
    db.InboxItem.findMany.mockResolvedValue([
      {
        id: "inbox-1",
        text: "Vendor renewal question",
        title: null,
        content: null,
        sourceUrl: null,
        status: "ARCHIVED",
        createdAt: new Date("2026-08-04"),
      },
    ]);

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "vendor renewal",
    });

    expect(response.results.map((result) => result.kind).sort()).toEqual([
      "goal",
      "inbox",
      "project",
      "resource",
      "task",
    ]);
    expect(
      response.results.find((result) => result.kind === "task"),
    ).toMatchObject({
      state: "wont-do",
      matchedField: "note",
      href: "/do/tasks/renew-insurance",
    });
    expect(
      response.results.find((result) => result.kind === "resource")?.href,
    ).toBe("/do/projects/operations#resource-resource-1");
    expect(
      response.results.find((result) => result.kind === "inbox"),
    ).toMatchObject({
      state: "archived",
      href: "/do/logbook?item=inbox-1",
    });
  });

  it("ranks exact title before prefix, title-token, then body matches", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([
      task({ id: "body", description: "Insurance", content: "vendor renewal" }),
      task({ id: "tokens", description: "Renewal for vendor", content: null }),
      task({
        id: "prefix",
        description: "Vendor renewal process",
        content: null,
      }),
      task({ id: "exact", description: "Vendor renewal", content: null }),
    ]);

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "vendor renewal",
    });
    expect(response.results.map((result) => result.id)).toEqual([
      "exact",
      "prefix",
      "tokens",
      "body",
    ]);
  });

  it("uses deterministic record-kind order for equally strong matches", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([task({ description: "Renewal" })]);
    db.Project.findMany.mockResolvedValue([
      project(1, { name: "Renewal", permalink: "renewal-project" }),
    ]);
    db.Goal.findMany.mockResolvedValue([
      {
        id: "goal-1",
        name: "Renewal",
        permalink: "renewal-goal",
        description: null,
        isDone: false,
        createdAt: new Date("2026-08-01"),
        lens: LENS,
      },
    ]);
    db.Resource.findMany.mockResolvedValue([
      {
        id: "resource-1",
        title: "Renewal",
        notes: null,
        url: null,
        createdAt: new Date("2026-08-01"),
        project: {
          name: "Operations",
          permalink: "operations",
          isDone: false,
          lens: LENS,
        },
      },
    ]);
    db.InboxItem.findMany.mockResolvedValue([
      {
        id: "inbox-1",
        text: "Renewal",
        title: "Renewal",
        content: null,
        sourceUrl: null,
        status: "UNPROCESSED",
        createdAt: new Date("2026-08-01"),
      },
    ]);

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results.map((item) => item.kind)).toEqual([
      "task",
      "project",
      "goal",
      "resource",
      "inbox",
    ]);
  });

  it("ranks the complete match set so an older exact match is not hidden", async () => {
    const db = entities();
    const newer = Array.from({ length: 60 }, (_, index) =>
      task({
        id: `newer-${index}`,
        description: `Renewal task ${index}`,
        createdAt: new Date(2026, 7, 31 - (index % 20)),
      }),
    );
    const olderExact = task({
      id: "older-exact",
      description: "Renewal",
      createdAt: new Date("2020-01-01"),
    });
    db.Task.findMany.mockImplementation(async (args) => {
      const titleFilter = args.where.OR?.[0]?.description;
      if (titleFilter?.equals) return [olderExact];
      if (titleFilter?.startsWith) return [olderExact, ...newer].slice(0, 11);
      return newer.slice(0, 11);
    });

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results[0].id).toBe("older-exact");
    expect(db.Task.findMany.mock.calls).toHaveLength(3);
    expect(
      db.Task.findMany.mock.calls.every(([args]) => args.take === 11),
    ).toBe(true);
    expect(response.truncated).toBe(true);
  });

  it("collapses matching task notes into one parent task result", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([
      task({
        description: "Insurance follow-up",
        content: null,
        updates: [{ body: "Renewal quote" }, { body: "Renewal decision" }],
      }),
    ]);
    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toMatchObject({
      kind: "task",
      matchedField: "note",
    });
  });

  it.each([
    [
      "title",
      { description: "Renewal", content: null, outcome: null },
      "title",
    ],
    [
      "content",
      { description: "Insurance", content: "Renewal details", outcome: null },
      "body",
    ],
    [
      "outcome",
      { description: "Insurance", content: null, outcome: "Renewal complete" },
      "outcome",
    ],
  ])(
    "searches Task %s with field precedence",
    async (_name, overrides, matchedField) => {
      const db = entities();
      db.Task.findMany.mockResolvedValue([task(overrides)]);
      const response = await searchSiteData(db, {
        userId: "user-1",
        query: "renewal",
      });
      expect(response.results[0].matchedField).toBe(matchedField);
    },
  );

  it.each([
    ["notes", { notes: "Renewal details", url: null }, "body"],
    ["url", { notes: null, url: "https://example.com/renewal" }, "url"],
  ])("searches Resource %s", async (_name, overrides, matchedField) => {
    const db = entities();
    db.Resource.findMany.mockResolvedValue([
      {
        id: "resource-1",
        title: "Policy",
        createdAt: new Date(),
        project: {
          name: "Operations",
          permalink: "operations",
          isDone: false,
          lens: LENS,
        },
        ...overrides,
      },
    ]);
    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results[0].matchedField).toBe(matchedField);
  });

  it.each([
    [
      "title",
      { title: "Renewal", text: "Note", content: null, sourceUrl: null },
      "title",
    ],
    [
      "text",
      { title: null, text: "Renewal note", content: null, sourceUrl: null },
      "title",
    ],
    [
      "content",
      { title: "Note", text: "Note", content: "Renewal body", sourceUrl: null },
      "body",
    ],
    [
      "sourceUrl",
      {
        title: "Note",
        text: "Note",
        content: null,
        sourceUrl: "https://example.com/renewal",
      },
      "url",
    ],
  ])("searches InboxItem %s", async (_name, overrides, matchedField) => {
    const db = entities();
    db.InboxItem.findMany.mockResolvedValue([
      { id: "inbox-1", status: "PENDING", createdAt: new Date(), ...overrides },
    ]);
    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results[0].matchedField).toBe(matchedField);
  });

  it.each([
    [false, "TODAY", "today"],
    [false, "UPCOMING", "upcoming"],
    [false, "SOMEDAY", "someday"],
    [false, "WONT_DO", "wont-do"],
    [true, "TODAY", "done"],
  ])("maps Task lifecycle done=%s status=%s", async (isDone, status, state) => {
    const db = entities();
    db.Task.findMany.mockResolvedValue([task({ isDone, status })]);
    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results[0].state).toBe(state);
  });

  it("caps each kind at 10, total results at 30, and marks truncation", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) =>
        task({ id: `task-${index}`, description: `Renewal task ${index}` }),
      ),
    );
    db.Project.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) => project(index + 1)),
    );
    db.Goal.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) => ({
        id: `goal-${index}`,
        name: `Renewal goal ${index}`,
        permalink: `renewal-goal-${index}`,
        description: null,
        isDone: false,
        createdAt: new Date(2026, 7, index + 1),
        lens: LENS,
      })),
    );

    const response = await searchSiteData(db, {
      userId: "user-1",
      query: "renewal",
    });
    expect(response.results).toHaveLength(30);
    expect(
      response.results.filter((result) => result.kind === "task"),
    ).toHaveLength(10);
    expect(
      response.results.filter((result) => result.kind === "project"),
    ).toHaveLength(10);
    expect(
      response.results.filter((result) => result.kind === "goal"),
    ).toHaveLength(10);
    expect(response.truncated).toBe(true);
  });
});

describe("getCommandPaletteIndexData", () => {
  it("returns compact tenant-scoped entries for every searchable kind", async () => {
    const db = entities();
    db.Lens.findMany.mockResolvedValue([
      { id: "lens-1", name: "Work", color: "indigo", kind: "WORK" },
    ]);
    db.Task.findMany.mockResolvedValue([task()]);
    db.Project.findMany.mockResolvedValue([project()]);
    db.Goal.findMany.mockResolvedValue([
      {
        id: "goal-1",
        name: "Renew",
        permalink: "renew",
        isDone: false,
        lens: LENS,
      },
    ]);
    db.Resource.findMany.mockResolvedValue([
      {
        id: "resource-1",
        title: "Policy",
        project: { name: "Operations", permalink: "operations", lens: LENS },
      },
    ]);
    db.InboxItem.findMany.mockResolvedValue([
      {
        id: "inbox-1",
        title: null,
        text: "Call broker",
        status: "UNPROCESSED",
        createdAt: new Date("2026-08-01"),
        archivedAt: null,
      },
    ]);

    const response = await getCommandPaletteIndexData(db, { userId: "user-1" });

    expect(response.items.map((item) => item.kind).sort()).toEqual([
      "goal",
      "inbox",
      "lens",
      "project",
      "resource",
      "task",
    ]);
    expect(JSON.stringify(response)).not.toMatch(
      /renewal terms|content|description/,
    );
    for (const entity of [
      db.Task,
      db.Project,
      db.Goal,
      db.Resource,
      db.InboxItem,
      db.Lens,
    ]) {
      expect(entity.findMany.mock.calls[0][0].where).toEqual({
        userId: "user-1",
      });
    }
    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "task",
          href: "/do/tasks/renew-insurance",
        }),
        expect.objectContaining({
          kind: "resource",
          href: "/do/projects/operations#resource-resource-1",
        }),
        expect.objectContaining({
          kind: "inbox",
          href: "/do/inbox?item=inbox-1",
        }),
        expect.objectContaining({ kind: "lens", href: null }),
      ]),
    );
  });

  it("keeps a 5,000-item compact index below the 2 MB benchmark", async () => {
    const db = entities();
    db.Task.findMany.mockResolvedValue(
      Array.from({ length: 5_000 }, (_, index) =>
        task({
          id: `task-${index}`,
          description: `Task ${index}`,
          permalink: `task-${index}`,
        }),
      ),
    );

    const response = await getCommandPaletteIndexData(db, {
      userId: "user-1",
    });

    expect(response.items).toHaveLength(5_000);
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThan(
      2_000_000,
    );
  });
});
