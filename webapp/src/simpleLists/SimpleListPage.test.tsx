import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const getSimpleList = vi.fn();
const createListItem = vi.fn();
const renameListItem = vi.fn();
const setListItemDone = vi.fn();
const deleteListItem = vi.fn();
const clearCompletedListItems = vi.fn();

const query = { current: { data: [] as any[], isLoading: false, error: null as Error | null } };
const activeLens = {
  current: {
    id: "shopping",
    name: "Shopping",
    purpose: "Groceries",
    kind: "CUSTOM",
    type: "SIMPLE_LIST" as "LIFE_AREA" | "SIMPLE_LIST",
    color: "cyan",
  },
};

vi.mock("wasp/client/operations", () => ({
  getSimpleList,
  createListItem,
  renameListItem,
  setListItemDone,
  deleteListItem,
  clearCompletedListItems,
  useQuery: () => query.current,
}));
vi.mock("../app/lensContext", () => ({ useActiveLens: () => activeLens.current }));
vi.mock("../components/ui", () => ({
  ConfirmDialog: ({ title, message, confirmLabel, cancelLabel, onConfirm, onClose }: any) => (
    <div role="dialog" aria-label={title}>
      <p>{message}</p>
      <button onClick={onClose}>{cancelLabel}</button>
      <button onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ),
}));

const { SimpleListPage } = await import("./SimpleListPage");

function item(id: string, text: string, isDone = false) {
  return {
    id,
    text,
    content: null,
    sourceUrl: null,
    isDone,
    order: 0,
    completedAt: isDone ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user-1",
    lensId: "shopping",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  query.current = { data: [item("milk", "Milk"), item("bread", "Bread", true)], isLoading: false, error: null };
  activeLens.current = { id: "shopping", name: "Shopping", purpose: "Groceries", kind: "CUSTOM", type: "SIMPLE_LIST", color: "cyan" };
  createListItem.mockResolvedValue({ id: "new" });
  renameListItem.mockResolvedValue({ id: "milk" });
  setListItemDone.mockResolvedValue({ id: "milk" });
  deleteListItem.mockResolvedValue({ id: "milk" });
  clearCompletedListItems.mockResolvedValue({ count: 1 });
});

describe("SimpleListPage", () => {
  it("renders open and checked sections with accessible actions", () => {
    render(<SimpleListPage />);
    expect(screen.getByRole("heading", { name: "Shopping" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checked 1" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Check Milk" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Reopen Bread" })).toBeChecked();
  });

  it("renders captured context and source without adding task properties", () => {
    query.current = {
      data: [{ ...item("article", "Read later"), content: "Good checklist patterns", sourceUrl: "https://example.com/list" }],
      isLoading: false,
      error: null,
    };
    render(<SimpleListPage />);
    expect(screen.getByText("Good checklist patterns")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute("href", "https://example.com/list");
    expect(screen.queryByText(/priority|project|when/i)).not.toBeInTheDocument();
  });

  it("does not turn an unsafe captured source scheme into a link", () => {
    query.current = {
      data: [{ ...item("unsafe", "Inspect source"), sourceUrl: "javascript:alert(1)" }],
      isLoading: false,
      error: null,
    };
    render(<SimpleListPage />);
    expect(screen.queryByRole("link", { name: "Open source" })).not.toBeInTheDocument();
  });

  it("adds directly and keeps the field available", async () => {
    render(<SimpleListPage />);
    const input = screen.getByRole("textbox", { name: "Add an item" });
    fireEvent.change(input, { target: { value: "Coffee" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(createListItem).toHaveBeenCalledWith({ lensId: "shopping", text: "Coffee" }));
    await waitFor(() => expect(input).toHaveFocus());
  });

  it("checks, renames, and removes one row", async () => {
    render(<SimpleListPage />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Check Milk" }));
    await waitFor(() => expect(setListItemDone).toHaveBeenCalledWith({ id: "milk", isDone: true }));

    fireEvent.click(screen.getByRole("button", { name: "Milk" }));
    const rename = screen.getByRole("textbox", { name: "Rename Milk" });
    fireEvent.change(rename, { target: { value: "Oat milk" } });
    fireEvent.keyDown(rename, { key: "Enter" });
    await waitFor(() => expect(renameListItem).toHaveBeenCalledWith({ id: "milk", text: "Oat milk" }));

    fireEvent.click(screen.getByRole("button", { name: "Remove Milk" }));
    await waitFor(() => expect(deleteListItem).toHaveBeenCalledWith({ id: "milk" }));
  });

  it("confirms before clearing checked items", async () => {
    render(<SimpleListPage />);
    fireEvent.click(screen.getByRole("button", { name: "Clear checked" }));
    const dialog = screen.getByRole("dialog", { name: "Clear checked items?" });
    expect(within(dialog).getByText(/permanently remove 1 checked item/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear checked" }));
    await waitFor(() => expect(clearCompletedListItems).toHaveBeenCalledWith({ lensId: "shopping" }));
  });

  it("supports row shortcuts and suppresses them while typing", async () => {
    render(<SimpleListPage />);
    fireEvent.keyDown(window, { key: " " });
    await waitFor(() => expect(setListItemDone).toHaveBeenCalledWith({ id: "milk", isDone: true }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Check Milk" })).not.toBeDisabled());
    setListItemDone.mockClear();
    const input = screen.getByRole("textbox", { name: "Add an item" });
    fireEvent.keyDown(input, { key: " " });
    expect(setListItemDone).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "n" });
    expect(input).toHaveFocus();
  });

  it("renders loading, error, empty, and incompatible states honestly", () => {
    query.current = { data: [], isLoading: true, error: null };
    const view = render(<SimpleListPage />);
    expect(screen.getByLabelText("Loading list")).toBeInTheDocument();

    query.current = { data: [], isLoading: false, error: new Error("Offline") };
    view.rerender(<SimpleListPage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Offline");
    expect(screen.getByText("List clear.")).toBeInTheDocument();

    activeLens.current = { ...activeLens.current, type: "LIFE_AREA" };
    view.rerender(<SimpleListPage />);
    expect(screen.getByRole("heading", { name: "Choose a Simple-list Lens." })).toBeInTheDocument();
  });
});
