import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const createLens = vi.fn();
const updateLens = vi.fn();
const deleteLens = vi.fn();
const getLenses = vi.fn();
const getAppData = vi.fn();

const rows = {
  current: [] as Array<Record<string, unknown>>,
};

vi.mock("wasp/client/operations", () => ({
  createLens,
  updateLens,
  deleteLens,
  getLenses,
  getAppData,
  useQuery: (operation: unknown) => operation === getLenses
    ? { data: rows.current, isLoading: false }
    : { data: undefined, isLoading: false },
}));

vi.mock("../billing/useEntitled", () => ({ useEntitled: () => true }));
vi.mock("../app/SettingsLayout", () => ({
  SettingsLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("../components/ui", () => ({
  ProGate: () => <div>Pro gate</div>,
  ConfirmDialog: ({ title, message, confirmLabel, onConfirm, onClose }: any) => (
    <div role="dialog" aria-label={title}>
      {message}
      <button onClick={onClose}>Cancel</button>
      <button onClick={onConfirm}>{confirmLabel}</button>
    </div>
  ),
}));

const { LensesPage } = await import("./LensesPage");

const lifeArea = {
  id: "life",
  name: "Studio",
  kind: "CUSTOM",
  type: "LIFE_AREA",
  color: "coral",
  purpose: "Products",
  counts: { goals: 1, projects: 2, tasks: 3, openItems: 0, checkedItems: 0 },
};
const shopping = {
  id: "shopping",
  name: "Shopping",
  kind: "CUSTOM",
  type: "SIMPLE_LIST",
  color: "cyan",
  purpose: "Groceries",
  counts: { goals: 0, projects: 0, tasks: 0, openItems: 8, checkedItems: 3 },
};
const packing = {
  ...shopping,
  id: "packing",
  name: "Packing",
  counts: { ...shopping.counts, openItems: 1, checkedItems: 0 },
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LensesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  createLens.mockResolvedValue({ id: "new" });
  updateLens.mockResolvedValue({ id: "updated" });
  deleteLens.mockResolvedValue({ id: "deleted" });
  rows.current = [lifeArea, shopping, packing];
});

describe("LensesPage Lens types", () => {
  it("defaults creation to Life area and submits a selected Simple list", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /new lens/i }));
    expect(screen.getByRole("radio", { name: /life area/i })).toBeChecked();
    fireEvent.change(screen.getByPlaceholderText(/studio, board/i), { target: { value: "Errands" } });
    fireEvent.click(screen.getByRole("radio", { name: /simple list/i }));
    fireEvent.click(screen.getByRole("button", { name: /create lens/i }));
    await waitFor(() => expect(createLens).toHaveBeenCalledWith(expect.objectContaining({
      name: "Errands",
      type: "SIMPLE_LIST",
    })));
  });

  it("shows type-appropriate counts", () => {
    renderPage();
    const studioRow = screen.getByText("Studio").closest(".aa-lenses-row") as HTMLElement;
    const shoppingRow = screen.getByText("Shopping").closest(".aa-lenses-row") as HTMLElement;
    expect(within(studioRow).getByText("1 goals")).toBeInTheDocument();
    expect(within(studioRow).getByText("3 tasks")).toBeInTheDocument();
    expect(within(shoppingRow).getByText("8 open")).toBeInTheDocument();
    expect(within(shoppingRow).getByText("3 checked")).toBeInTheDocument();
  });

  it("shows immutable type metadata while editing", () => {
    renderPage();
    const shoppingRow = screen.getByText("Shopping").closest(".aa-lenses-row") as HTMLElement;
    fireEvent.click(within(shoppingRow).getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Lens type cannot be changed after creation.")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /life area/i })).not.toBeInTheDocument();
  });

  it("offers only same-type reassignment targets", () => {
    renderPage();
    const shoppingRow = screen.getByText("Shopping").closest(".aa-lenses-row") as HTMLElement;
    fireEvent.click(within(shoppingRow).getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: /delete the "Shopping" lens/i });
    const options = within(dialog).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["Packing"]);
    expect(within(dialog).getByText(/8 open items, 3 checked items/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/delete everything/i)).not.toBeInTheDocument();
  });
});
