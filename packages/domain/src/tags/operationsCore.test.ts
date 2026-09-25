// #16 — tag ops + reserved seeding. The cores are plain functions over the
// seam, so the suite drives them with mock delegates (mockContext pattern)
// and asserts on the exact payloads — link's resolve-vs-create vs idempotent
// re-link, unlink's link-only removal, tenancy rejection, and the 7-name
// seed's idempotence via ensureOnboardedCore.
import { describe, expect, it, vi } from "vitest";

import { mockContext } from "../test/mockContext.js";
import {
  RESERVED_TAG_NAMES,
  linkTaskTagCore,
  listTagsCore,
  normalizeTagName,
  seedReservedTagsCore,
  unlinkTaskTagCore,
} from "./operationsCore.js";

type TagCore = Parameters<typeof linkTaskTagCore>[0];

function tagScaffold() {
  const m = mockContext();
  m.entities.Task.findFirst.mockResolvedValue({ id: "task-1" });
  m.entities.Tag.upsert.mockResolvedValue({ id: "tag-1" });
  m.entities.Task.update.mockResolvedValue({ id: "task-1" });
  return m;
}

describe("normalizeTagName", () => {
  it("strips a leading #/@ and lowercases (the triage convention)", () => {
    expect(normalizeTagName("#Deep-Work")).toBe("deep-work");
    expect(normalizeTagName("@Low-Energy")).toBe("low-energy");
    expect(normalizeTagName("  ~30m ")).toBe("~30m");
  });
});

describe("listTagsCore", () => {
  it("returns the user's tags name-ordered", async () => {
    const m = tagScaffold();
    m.entities.Tag.findMany.mockResolvedValue([
      { id: "t1", name: "low-energy", color: "teal" },
    ]);
    const rows = await listTagsCore(m.entities as unknown as TagCore, {
      userId: "user-1",
    });
    expect(rows).toHaveLength(1);
    expect(m.entities.Tag.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true, name: true, color: true },
    });
  });
});

describe("linkTaskTagCore", () => {
  it("resolves-or-creates by normalized name, then connects (tenancy-checked)", async () => {
    const m = tagScaffold();
    const result = await linkTaskTagCore(m.entities as unknown as TagCore, {
      userId: "user-1",
      taskId: "task-1",
      name: "#Deep-Work",
    });
    expect(result).toEqual({ taskId: "task-1", tagId: "tag-1", name: "deep-work" });
    expect(m.entities.Tag.upsert).toHaveBeenCalledWith({
      where: { userId_name: { userId: "user-1", name: "deep-work" } },
      create: { name: "deep-work", color: "teal", userId: "user-1" },
      update: {},
      select: { id: true },
    });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { tags: { connect: [{ id: "tag-1" }] } },
    });
  });

  it("rejects a task owned by someone else", async () => {
    const m = tagScaffold();
    m.entities.Task.findFirst.mockResolvedValue(null);
    await expect(
      linkTaskTagCore(m.entities as unknown as TagCore, {
        userId: "user-1",
        taskId: "someone-elses",
        name: "x",
      }),
    ).rejects.toThrow(/Task not found/);
    expect(m.entities.Tag.upsert).not.toHaveBeenCalled();
  });

  it("rejects an empty name after normalization", async () => {
    const m = tagScaffold();
    await expect(
      linkTaskTagCore(m.entities as unknown as TagCore, {
        userId: "user-1",
        taskId: "task-1",
        name: "##",
      }),
    ).rejects.toThrow(/Tag name is required/);
  });
});

describe("unlinkTaskTagCore", () => {
  it("disconnects the link only — never deletes the Tag row", async () => {
    const m = tagScaffold();
    const result = await unlinkTaskTagCore(m.entities as unknown as TagCore, {
      userId: "user-1",
      taskId: "task-1",
      tagId: "tag-1",
    });
    expect(result).toEqual({ taskId: "task-1", tagId: "tag-1" });
    expect(m.entities.Task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { tags: { disconnect: [{ id: "tag-1" }] } },
    });
    expect(m.entities.Tag.delete).not.toHaveBeenCalled();
  });

  it("rejects a task owned by someone else", async () => {
    const m = tagScaffold();
    m.entities.Task.findFirst.mockResolvedValue(null);
    await expect(
      unlinkTaskTagCore(m.entities as unknown as TagCore, {
        userId: "user-1",
        taskId: "someone-elses",
        tagId: "tag-1",
      }),
    ).rejects.toThrow(/Task not found/);
  });
});

describe("seedReservedTagsCore", () => {
  it("upserts exactly the 7 reserved names with the default color", async () => {
    const m = tagScaffold();
    await seedReservedTagsCore(m.entities as unknown as TagCore, { userId: "user-1" });
    const names = m.entities.Tag.upsert.mock.calls.map(
      (c) => c[0].where.userId_name.name,
    );
    expect(names).toEqual([...RESERVED_TAG_NAMES]);
    for (const call of m.entities.Tag.upsert.mock.calls) {
      expect(call[0].create.color).toBe("teal");
      expect(call[0].update).toEqual({});
    }
  });

  it("is idempotent — a rerun issues the same no-op upserts", async () => {
    const m = tagScaffold();
    await seedReservedTagsCore(m.entities as unknown as TagCore, { userId: "user-1" });
    await seedReservedTagsCore(m.entities as unknown as TagCore, { userId: "user-1" });
    expect(m.entities.Tag.upsert).toHaveBeenCalledTimes(RESERVED_TAG_NAMES.length * 2);
  });
});
