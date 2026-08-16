import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No module mocking: the ops are injected through the component's explicit
// `deps` seam (see CommandPalette.tsx). The fake useQuery returns a
// controllable query state; searchSite/getCommandPaletteIndex are identity
// tokens the component passes through to it.
import { CommandPalette, type CommandPaletteDeps } from "./CommandPalette";
import type { SearchSiteResult } from "./operationsCore";

const useQuery = vi.fn();
const searchSite = vi.fn();
const getCommandPaletteIndex = vi.fn();
// SAFETY: vi.fn() fakes satisfy the ops signatures at runtime; the single
// grouped cast covers all three (Wasp's QueryFn generics can't infer through).
const deps = {
  useQuery,
  searchSite,
  getCommandPaletteIndex,
} as CommandPaletteDeps;

const RESULT = {
  id: "task-1",
  kind: "task" as const,
  title: "Renew insurance",
  subtitle: "Operations",
  snippet: "Check renewal terms before Friday",
  matchedField: "title" as const,
  href: "/do/tasks/renew-insurance",
  lens: { id: "lens-1", name: "Work", color: "indigo" },
  state: "upcoming" as const,
};

function renderPalette(
  overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {},
) {
  const props: React.ComponentProps<typeof CommandPalette> = {
    mode: "search",
    entitled: true,
    lenses: [{ id: "lens-1", name: "Work", color: "indigo" }],
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onSwitchLens: vi.fn(),
    onCapture: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenShortcuts: vi.fn(),
    deps,
    ...overrides,
  };
  const view = render(
    <MemoryRouter>
      <CommandPalette {...props} />
    </MemoryRouter>,
  );
  return { props, view };
}

beforeEach(() => {
  vi.useFakeTimers();
  useQuery.mockImplementation(() => ({
    data: undefined,
    error: null,
    isFetching: false,
  }));
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("CommandPalette", () => {
  it("shows one calm billing link for Free accounts and disables the query", () => {
    renderPalette({ entitled: false });
    expect(
      screen.getByText("Command palette and search is a Pro feature."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute(
      "href",
      "/do/settings/billing",
    );
    expect(
      screen.getByText(
        "find and move through all your ActionAmp work from one place",
      ),
    ).toBeInTheDocument();
    expect(useQuery.mock.calls[0][2]).toMatchObject({ enabled: false });
  });

  it("opens command mode with destinations and runs selected command on Enter", () => {
    const { props } = renderPalette({ mode: "command" });
    expect(screen.getByRole("option", { name: /Next/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onNavigate).toHaveBeenCalledWith("/do");
  });

  it("moves through commands with arrow keys", () => {
    const { props } = renderPalette({ mode: "command" });
    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onCapture).toHaveBeenCalledTimes(1);
  });

  it("shows only compatible workflow commands for a Simple-list Lens", () => {
    const { props } = renderPalette({
      mode: "command",
      activeLensType: "SIMPLE_LIST",
    });
    fireEvent.click(
      screen.getByRole("option", { name: /List.*Open checklist/i }),
    );
    expect(props.onNavigate).toHaveBeenCalledWith("/do/list");
    expect(
      screen.queryByRole("option", { name: /Next/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Capture a thought/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Inbox/ })).toBeInTheDocument();
  });

  it("debounces search, renders grouped results, and opens the selected destination", () => {
    useQuery.mockImplementation((operation) => ({
      data:
        operation === searchSite
          ? { query: "renewal", results: [RESULT], truncated: false }
          : { items: [] },
      error: null,
      isFetching: false,
    }));
    const { props } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "renewal" },
    });
    act(() => vi.advanceTimersByTime(201));

    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Renew insurance")).toBeInTheDocument();
    expect(
      screen.getByText(/Work · Operations · Upcoming/),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(props.onNavigate).toHaveBeenCalledWith("/do/tasks/renew-insurance");
  });

  it("waits for two characters before enabling server search", () => {
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "r" } });
    act(() => vi.advanceTimersByTime(201));
    expect(
      screen.getByText("Type one more character to search."),
    ).toBeInTheDocument();
    expect(useQuery.mock.calls.at(-1)?.[2]).toMatchObject({ enabled: false });
  });

  it("keeps one-character local command matching usable without server search", () => {
    renderPalette({ mode: "command" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "t" } });
    expect(screen.getByRole("option", { name: /Today/ })).toBeInTheDocument();
    expect(useQuery.mock.calls[0][2]).toMatchObject({ enabled: false });
  });

  it("closes on Escape", () => {
    const { props } = renderPalette();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the empty command state to six common choices plus guidance", () => {
    renderPalette({ mode: "command" });
    expect(screen.getAllByRole("option")).toHaveLength(6);
    expect(screen.getByText("Type to find anything.")).toBeInTheDocument();
  });

  it("uses Fuse typo matching while server search is unavailable", () => {
    useQuery.mockImplementation((operation) =>
      operation === getCommandPaletteIndex
        ? {
            data: {
              items: [
                {
                  id: "project-1",
                  kind: "project",
                  title: "Launch project",
                  subtitle: "Work",
                  href: "/do/projects/launch",
                  aliases: ["project", "plan"],
                },
              ],
            },
            error: null,
            isFetching: false,
          }
        : { data: undefined, error: new Error("offline"), isFetching: false },
    );
    const { props } = renderPalette({ mode: "command" });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "lanch projct" },
    });
    act(() => vi.advanceTimersByTime(201));
    expect(
      screen.getByRole("option", { name: /Launch project/ }),
    ).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(props.onNavigate).toHaveBeenCalledWith("/do/projects/launch");
  });

  it("switches a Lens from the compact index by pointer", () => {
    useQuery.mockImplementation((operation) =>
      operation === getCommandPaletteIndex
        ? {
            data: {
              items: [
                {
                  id: "lens-1",
                  kind: "lens",
                  title: "Work",
                  subtitle: "Switch lens",
                  href: null,
                  aliases: ["lens", "switch context"],
                },
              ],
            },
            error: null,
            isFetching: false,
          }
        : { data: undefined, error: null, isFetching: false },
    );
    const { props } = renderPalette({ mode: "command" });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "work" },
    });
    fireEvent.click(screen.getByRole("option", { name: /Work.*Switch lens/i }));
    expect(props.onSwitchLens).toHaveBeenCalledWith("lens-1");
  });

  it("renders loading, empty, error, and truthful truncation states", () => {
    useQuery.mockImplementation((operation) =>
      operation === searchSite
        ? { data: undefined, error: null, isFetching: true }
        : { data: undefined, error: null, isFetching: false },
    );
    const { props, view } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "renewal" },
    });
    act(() => vi.advanceTimersByTime(201));
    expect(screen.getByText("Searching…")).toBeInTheDocument();

    useQuery.mockImplementation((operation) =>
      operation === searchSite
        ? {
            data: { query: "renewal", results: [], truncated: false },
            error: null,
            isFetching: false,
          }
        : { data: undefined, error: null, isFetching: false },
    );
    view.rerender(
      <MemoryRouter>
        <CommandPalette {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No matches/)).toBeInTheDocument();

    useQuery.mockImplementation((operation) =>
      operation === searchSite
        ? { data: undefined, error: new Error("nope"), isFetching: false }
        : { data: undefined, error: null, isFetching: false },
    );
    view.rerender(
      <MemoryRouter>
        <CommandPalette {...props} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("Search unavailable. Try again."),
    ).toBeInTheDocument();

    useQuery.mockImplementation((operation) =>
      operation === searchSite
        ? {
            data: { query: "renewal", results: [RESULT], truncated: true },
            error: null,
            isFetching: false,
          }
        : { data: undefined, error: null, isFetching: false },
    );
    view.rerender(
      <MemoryRouter>
        <CommandPalette {...props} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText("More matches—refine your search"),
    ).toBeInTheDocument();
  });

  it("fuzzy-matches a lens and switches it without navigating", () => {
    const { props } = renderPalette({ mode: "command" });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "wrk lens" },
    });
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(props.onSwitchLens).toHaveBeenCalledWith("lens-1");
    expect(props.onNavigate).not.toHaveBeenCalled();
  });

  it("ignores a stale server response after the query changes", () => {
    useQuery.mockImplementation((operation) => ({
      data:
        operation === searchSite
          ? { query: "renewal", results: [RESULT], truncated: false }
          : { items: [] },
      error: null,
      isFetching: false,
    }));
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "different" },
    });
    act(() => vi.advanceTimersByTime(201));
    expect(screen.queryByText("Renew insurance")).not.toBeInTheDocument();
    expect(screen.getByText("No matches for “different”.")).toBeInTheDocument();
  });

  it.each([
    {
      state: "loading",
      response: { data: undefined, error: null, isFetching: true },
      message: "Searching…",
    },
    {
      state: "error",
      response: {
        data: undefined,
        error: new Error("unavailable"),
        isFetching: false,
      },
      message: "Search unavailable. Try again.",
    },
    {
      state: "empty",
      response: {
        data: { query: "renewal", results: [], truncated: false },
        error: null,
        isFetching: false,
      },
      message: "No matches for “renewal”.",
    },
  ])("renders the $state async state", ({ response, message }) => {
    useQuery.mockImplementation((operation) =>
      operation === searchSite
        ? response
        : { data: { items: [] }, error: null, isFetching: false },
    );
    renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "renewal" },
    });
    act(() => vi.advanceTimersByTime(201));
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("keeps selection attached to a stable id while results reorder", () => {
    const second = { ...RESULT, id: "task-2", title: "Renewal quote" };
    let results = [RESULT, second];
    useQuery.mockImplementation((operation) => ({
      data:
        operation === searchSite
          ? { query: "renewal", results, truncated: false }
          : { items: [] },
      error: null,
      isFetching: false,
    }));
    const { props, view } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "renewal" },
    });
    act(() => vi.advanceTimersByTime(201));
    fireEvent.pointerMove(
      screen.getByRole("option", { name: /Renewal quote/ }),
    );
    expect(
      screen.getByRole("option", { name: /Renewal quote/ }),
    ).toHaveAttribute("aria-selected", "true");

    results = [second, RESULT];
    view.rerender(
      <MemoryRouter>
        <CommandPalette {...props} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("option", { name: /Renewal quote/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("traps Tab between the input and close control", () => {
    renderPalette();
    const input = screen.getByRole("combobox");
    const close = screen.getByRole("button", { name: "Close search" });
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(input).toHaveFocus();
  });

  it("returns focus to the invoking control on close", () => {
    const invoker = document.createElement("button");
    document.body.appendChild(invoker);
    invoker.focus();
    const { view } = renderPalette();
    expect(screen.getByRole("combobox")).toHaveFocus();
    view.unmount();
    expect(invoker).toHaveFocus();
    invoker.remove();
  });

  it("keeps selection by stable id when server results merge in", () => {
    let serverResults: (typeof RESULT)[] = [];
    useQuery.mockImplementation((operation) =>
      operation === getCommandPaletteIndex
        ? {
            data: {
              items: [
                {
                  id: "project-a",
                  kind: "project",
                  title: "Project Alpha",
                  subtitle: "Work",
                  href: "/do/projects/alpha",
                  aliases: ["project"],
                },
                {
                  id: "project-b",
                  kind: "project",
                  title: "Project Beta",
                  subtitle: "Work",
                  href: "/do/projects/beta",
                  aliases: ["project"],
                },
              ],
            },
            error: null,
            isFetching: false,
          }
        : {
            data: {
              query: "project",
              results: serverResults,
              truncated: false,
            },
            error: null,
            isFetching: false,
          },
    );
    const { props, view } = renderPalette({ mode: "command" });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "project" },
    });
    act(() => vi.advanceTimersByTime(201));
    const beta = screen.getByRole("option", { name: /Project Beta/ });
    fireEvent.pointerMove(beta);
    expect(beta).toHaveAttribute("aria-selected", "true");

    serverResults = [{ ...RESULT, id: "task-new", title: "Project" }];
    view.rerender(
      <MemoryRouter>
        <CommandPalette {...props} />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("option", { name: /Project Beta/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it.each([
    ["project", "/do/projects/renewal"],
    ["goal", "/do/goals/renewal"],
    ["resource", "/do/projects/renewal#resource-resource-1"],
    ["inbox", "/do/inbox?item=inbox-1"],
    ["archived inbox", "/do/logbook?item=inbox-1"],
  ] as const)("opens the exact %s destination", (label, href) => {
    const archived = label === "archived inbox";
    const kind = label.includes("inbox") ? "inbox" : label;
    // SAFETY: spread result narrowed to SearchSiteResult for renderPalette compatibility.
    const result = {
      ...RESULT,
      id: `${kind}-1`,
      kind,
      title: `Record ${label}`,
      href,
      state: archived ? "archived" : kind === "inbox" ? "inbox" : "active",
    } as SearchSiteResult;
    useQuery.mockImplementation((operation) => ({
      data:
        operation === searchSite
          ? { query: "record", results: [result], truncated: false }
          : { items: [] },
      error: null,
      isFetching: false,
    }));
    const { props } = renderPalette();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "record" },
    });
    act(() => vi.advanceTimersByTime(201));
    fireEvent.click(
      screen.getByRole("option", { name: new RegExp(result.title) }),
    );
    expect(props.onNavigate).toHaveBeenCalledWith(href);
  });
});
