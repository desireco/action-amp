// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  MAX_LIST_ITEM_TEXT_LENGTH,
  clearCompletedListItemsCore,
  createListItemCore,
  deleteListItemCore,
  getSimpleListCore,
  renameListItemCore,
  setListItemDoneCore,
} from "./operationsCore";

function delegate() {
  return {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function entities() {
  return { Lens: delegate(), ListItem: delegate() };
}

const simpleLens = { id: "list-1", type: "SIMPLE_LIST" };
const ownedItem = { id: "item-1", userId: "user-1", lens: { type: "SIMPLE_LIST" } };

describe("getSimpleListCore", () => {
  it("requires ownership and returns open items first in stable order", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(simpleLens);
    db.ListItem.findMany.mockResolvedValue([]);

    await getSimpleListCore(db, { userId: "user-1", lensId: "list-1" });

    expect(db.Lens.findFirst).toHaveBeenCalledWith({
      where: { id: "list-1", userId: "user-1" },
      select: { id: true, type: true },
    });
    expect(db.ListItem.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", lensId: "list-1" },
      orderBy: [{ isDone: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });
  });

  it("rejects a missing or cross-tenant Lens", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(null);
    await expect(getSimpleListCore(db, { userId: "user-1", lensId: "other" })).rejects.toThrow(/not found/i);
  });

  it("rejects a Life-area Lens", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue({ id: "life-1", type: "LIFE_AREA" });
    await expect(getSimpleListCore(db, { userId: "user-1", lensId: "life-1" })).rejects.toThrow(/Simple-list Lens/i);
  });
});

describe("createListItemCore", () => {
  it("trims text and appends after the highest order", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(simpleLens);
    db.ListItem.findFirst.mockResolvedValue({ order: 7 });
    db.ListItem.create.mockResolvedValue({ id: "item-2" });

    await createListItemCore(db, { userId: "user-1", lensId: "list-1", text: "  Milk  " });

    expect(db.ListItem.create).toHaveBeenCalledWith({
      data: { userId: "user-1", lensId: "list-1", text: "Milk", content: null, sourceUrl: null, order: 8 },
    });
  });

  it("preserves captured body and source without adding task metadata", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(simpleLens);
    db.ListItem.findFirst.mockResolvedValue(null);
    await createListItemCore(db, {
      userId: "user-1",
      lensId: "list-1",
      text: "Read later",
      content: "Useful checklist notes",
      sourceUrl: "https://example.com/list",
    });
    expect(db.ListItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        text: "Read later",
        content: "Useful checklist notes",
        sourceUrl: "https://example.com/list",
      }),
    });
  });

  it("rejects empty and overlong text", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(simpleLens);
    db.ListItem.findFirst.mockResolvedValue(null);
    await expect(createListItemCore(db, { userId: "user-1", lensId: "list-1", text: "  " })).rejects.toThrow(/required/i);
    await expect(createListItemCore(db, { userId: "user-1", lensId: "list-1", text: "x".repeat(MAX_LIST_ITEM_TEXT_LENGTH + 1) })).rejects.toThrow(/characters or fewer/i);
  });
});

describe("item mutations", () => {
  it("renames owned items with normalized text", async () => {
    const db = entities();
    db.ListItem.findFirst.mockResolvedValue(ownedItem);
    await renameListItemCore(db, { userId: "user-1", id: "item-1", text: "  Coffee  " });
    expect(db.ListItem.update).toHaveBeenCalledWith({ where: { id: "item-1" }, data: { text: "Coffee" } });
  });

  it("sets and clears completion timestamps", async () => {
    const db = entities();
    db.ListItem.findFirst.mockResolvedValue(ownedItem);
    await setListItemDoneCore(db, { userId: "user-1", id: "item-1", isDone: true });
    expect(db.ListItem.update).toHaveBeenLastCalledWith({ where: { id: "item-1" }, data: { isDone: true, completedAt: expect.any(Date) } });
    await setListItemDoneCore(db, { userId: "user-1", id: "item-1", isDone: false });
    expect(db.ListItem.update).toHaveBeenLastCalledWith({ where: { id: "item-1" }, data: { isDone: false, completedAt: null } });
  });

  it("deletes one owned item", async () => {
    const db = entities();
    db.ListItem.findFirst.mockResolvedValue(ownedItem);
    await deleteListItemCore(db, { userId: "user-1", id: "item-1" });
    expect(db.ListItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
  });

  it("rejects missing, cross-tenant, and wrong-type items", async () => {
    const db = entities();
    db.ListItem.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...ownedItem, lens: { type: "LIFE_AREA" } });
    await expect(deleteListItemCore(db, { userId: "user-1", id: "other" })).rejects.toThrow(/not found/i);
    await expect(deleteListItemCore(db, { userId: "user-1", id: "item-1" })).rejects.toThrow(/Simple-list Lens/i);
  });
});

describe("clearCompletedListItemsCore", () => {
  it("deletes only completed owned items in one verified Simple-list Lens", async () => {
    const db = entities();
    db.Lens.findFirst.mockResolvedValue(simpleLens);
    db.ListItem.deleteMany.mockResolvedValue({ count: 2 });
    await clearCompletedListItemsCore(db, { userId: "user-1", lensId: "list-1" });
    expect(db.ListItem.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", lensId: "list-1", isDone: true } });
  });
});
