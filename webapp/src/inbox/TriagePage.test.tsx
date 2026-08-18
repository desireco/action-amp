import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const inboxItems = {
  // SAFETY: test fixture; mock data cast to any[] for useQuery compatibility.
  current: [
    {
      id: "ix-1",
      text: "Email Sarah",
      createdAt: new Date(),
      parsedDate: null,
      parsedLens: null,
      parsedProject: null,
      parsedPriority: null,
      parsedSize: null,
      parsedTags: [],
    },
  ] as Array<Record<string, unknown>>,
};

const appData = {
  current: {
    lenses: [{ id: "lens-1", name: "Work", color: "indigo" }],
  },
};

const activeLens = {
  current: { id: "lens-1", name: "Work", color: "indigo" },
};

const projects = {
  // SAFETY: test fixture; empty array narrowed to typed Array for query compatibility.
  current: [] as Array<{
    id: string;
    name: string;
    lensId: string;
    goal?: { name: string } | null;
  }>,
};

const resolverProjects = {
  // SAFETY: test fixture; empty array narrowed to typed Array for query compatibility.
  current: [] as Array<{
    id: string;
    name: string;
    permalink?: string;
    type?: string;
    lensId: string;
    lensName?: string | null;
    lensColor?: string | null;
  }>,
};

const getInboxItems = vi.fn();
const triageInboxItem = vi.fn();
const updateInboxItem = vi.fn();
const getAppData = vi.fn();
const getProjects = vi.fn();
const getProjectsForResolver = vi.fn();
const getGoals = vi.fn();

vi.mock("wasp/client/operations", () => ({
  useQuery: (fn: unknown) => {
    if (fn === getInboxItems) return { data: inboxItems.current, isLoading: false, error: null };
    if (fn === getAppData) return { data: appData.current, isLoading: false, error: null };
    if (fn === getProjects) return { data: projects.current, isLoading: false, error: null };
    if (fn === getProjectsForResolver) return { data: resolverProjects.current, isLoading: false, error: null };
    if (fn === getGoals) return { data: [], isLoading: false, error: null };
    return { data: undefined, isLoading: false, error: null };
  },
  getInboxItems,
  triageInboxItem,
  updateInboxItem,
  getAppData,
  getProjects,
  getProjectsForResolver,
  getGoals,
}));

vi.mock("../app/lensContext", () => ({
  useActiveLens: () => activeLens.current,
}));

const { TriagePage } = await import("./TriagePage");

function renderTriagePage(initialEntry = "/do/inbox/review") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/do/inbox/review" element={<TriagePage />} />
          <Route path="/do/inbox" element={<div>Inbox</div>} />
          <Route path="/do" element={<div>App home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  appData.current = {
    lenses: [{ id: "lens-1", name: "Work", color: "indigo" }],
  };
  activeLens.current = { id: "lens-1", name: "Work", color: "indigo" };
  projects.current = [];
  resolverProjects.current = [];
  inboxItems.current = [
    {
      id: "ix-1",
      text: "Email Sarah",
      createdAt: new Date(),
      parsedDate: null,
      parsedLens: null,
      parsedProject: null,
      parsedPriority: null,
      parsedSize: null,
      parsedTags: [],
    },
  ];
  triageInboxItem.mockRejectedValue(new Error("Server unavailable"));
  updateInboxItem.mockResolvedValue({ id: "ix-1" });
});

describe("TriagePage", () => {
  it("offers Simple-list Lenses as destination choices", () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", color: "indigo" },
        { id: "shopping", name: "Shopping", color: "cyan" },
      ],
    };
    renderTriagePage();
    expect(screen.getByRole("radio", { name: "Work" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Shopping" })).toBeInTheDocument();
  });

  it("uses one editable confirmation to add a captured item to a Simple list", async () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", color: "indigo" },
      ],
    };
    activeLens.current = { id: "lens-1", name: "Work", color: "indigo" };
    resolverProjects.current = [
      { id: "groceries", name: "Groceries", permalink: "groceries", type: "SIMPLE_LIST", lensId: "lens-1", lensName: "Work", lensColor: "indigo" },
    ];
    triageInboxItem.mockResolvedValue({ kind: "list-item", id: "li-1" });
    renderTriagePage();

    fireEvent.click(await screen.findByRole("button", { name: /List item/ }));
    const listPicker = screen.getByRole("combobox", { name: "Add to list" });
    fireEvent.change(listPicker, { target: { value: "groceries" } });

    const title = await screen.findByRole("textbox", { name: "Captured text" });
    expect(screen.getByRole("button", { name: "Add to Groceries" })).toBeInTheDocument();
    // One-step flow: no Spec step, no When/Size/Priority property rows.
    expect(screen.queryByText(/2 · Specify/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/When/i)).not.toBeInTheDocument();
    fireEvent.change(title, { target: { value: "Oat milk" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to Groceries" }));

    await waitFor(() => expect(triageInboxItem).toHaveBeenCalledWith(expect.objectContaining({
      inboxItemId: "ix-1",
      decision: "list-item",
      projectId: "groceries",
      name: "Oat milk",
    })));
  });

  it("routes a Simple-list project mention to the one-step list-item flow", async () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", color: "indigo" },
      ],
    };
    activeLens.current = { id: "lens-1", name: "Work", color: "indigo" };
    resolverProjects.current = [
      { id: "shopping", name: "Shopping", permalink: "shopping", type: "SIMPLE_LIST", lensId: "lens-1", lensName: "Work", lensColor: "indigo" },
    ];
    inboxItems.current[0] = {
      ...inboxItems.current[0],
      text: "buy oat milk Shopping",
      parsedProject: "Shopping",
    };
    triageInboxItem.mockResolvedValue({ kind: "list-item", id: "li-1" });
    renderTriagePage();
    // The mentioned list is preselected and structured types are not offered —
    // the destination IS a checklist.
    const listPicker = await screen.findByRole("combobox", { name: "Add to list" });
    expect(listPicker).toHaveValue("shopping");
    expect(screen.queryByRole("button", { name: /^Task/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Project/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to Shopping" }));
    await waitFor(() => expect(triageInboxItem).toHaveBeenCalledWith(expect.objectContaining({
      inboxItemId: "ix-1",
      decision: "list-item",
      projectId: "shopping",
    })));
  });

  it("lets a list-item choice override inferred project context", async () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", color: "indigo" },
      ],
    };
    resolverProjects.current = [
      { id: "project-1", name: "Groceries", permalink: "groceries", type: "STANDARD", lensId: "lens-1", lensName: "Work", lensColor: "indigo" },
      { id: "packing", name: "Packing", permalink: "packing", type: "SIMPLE_LIST", lensId: "lens-1", lensName: "Work", lensColor: "indigo" },
    ];
    inboxItems.current[0] = {
      ...inboxItems.current[0],
      text: "Buy milk Groceries",
      parsedProject: "Groceries",
    };
    renderTriagePage();
    // Project-bridged inference names the task destination, but the user can
    // still route this item to a Simple list instead.
    fireEvent.click(await screen.findByRole("button", { name: /List item/ }));
    const listPicker = screen.getByRole("combobox", { name: "Add to list" });
    fireEvent.change(listPicker, { target: { value: "packing" } });
    expect(screen.getByRole("button", { name: "Add to Packing" })).toBeInTheDocument();
  });

  it("allows image-backed captures to move into a Simple list", async () => {
    appData.current = {
      lenses: [{ id: "lens-1", name: "Work", color: "indigo" }],
    };
    activeLens.current = { id: "lens-1", name: "Work", color: "indigo" };
    resolverProjects.current = [
      { id: "shopping", name: "Shopping", permalink: "shopping", type: "SIMPLE_LIST", lensId: "lens-1", lensName: "Work", lensColor: "indigo" },
    ];
    inboxItems.current[0] = { ...inboxItems.current[0], attachments: [{ id: "image-1" }] };
    renderTriagePage();
    fireEvent.click(await screen.findByRole("button", { name: /List item/ }));
    const listPicker = screen.getByRole("combobox", { name: "Add to list" });
    fireEvent.change(listPicker, { target: { value: "shopping" } });
    expect(await screen.findByText(/attachments will move with it to Shopping/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to Shopping" })).toBeEnabled();
  });

  it("starts on Classify and advances straight to Spec with one Continue", async () => {
    renderTriagePage();

    expect(screen.getByText("1 · Classify")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /task/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Work" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(await screen.findByText(/2 · Specify the task/i)).toBeInTheDocument();
  });

  it("linkifies bare URLs in the read-only Classify card, then edits raw in Spec", async () => {
    inboxItems.current[0] = {
      ...inboxItems.current[0],
      text: "Read https://example.com/guide before standup",
    };
    renderTriagePage();

    const link = await screen.findByRole("link", { name: "https://example.com/guide" });
    expect(link).toHaveAttribute("href", "https://example.com/guide");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    // Clicking the linkified URL is the link's own click — the body must NOT
    // turn into an editor.
    fireEvent.click(link);
    expect(screen.queryByRole("textbox", { name: "Captured text" })).not.toBeInTheDocument();
    expect(link).toBeInTheDocument();

    // Spec keeps the title as a reading surface too — the URL stays a link…
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(
      await screen.findByRole("link", { name: "https://example.com/guide" }),
    ).toBeInTheDocument();

    // …and the pencil opens the raw-text editor (an editor, not a viewer).
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    expect(await screen.findByLabelText("Title")).toHaveValue(
      "Read https://example.com/guide before standup",
    );
  });

  it("edits the captured text in Classify and persists it back to the item", async () => {
    vi.useFakeTimers();
    updateInboxItem.mockResolvedValue({ id: "ix-1" });
    inboxItems.current[0] = {
      ...inboxItems.current[0],
      text: "I realy like this headphones",
    };
    const { unmount } = renderTriagePage();

    // Reading surface first — the editor is hidden until edit is asked for.
    expect(screen.getByText("I realy like this headphones")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Captured text" })).not.toBeInTheDocument();

    // Clicking the body text itself opens the editor (the simple-list rename
    // pattern) — the pencil button is the visible affordance, not the only path.
    fireEvent.click(screen.getByText("I realy like this headphones"));
    expect(screen.getByRole("textbox", { name: "Captured text" })).toBeInTheDocument();
    fireEvent.blur(screen.getByRole("textbox", { name: "Captured text" }));

    // …and so does the pencil.
    fireEvent.click(screen.getByRole("button", { name: "Edit captured text" }));
    const editor = screen.getByRole("textbox", { name: "Captured text" });
    fireEvent.change(editor, { target: { value: "I really like these headphones" } });

    // The write-back to the InboxItem is debounced.
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(updateInboxItem).toHaveBeenCalledWith({
      inboxItemId: "ix-1",
      text: "I really like these headphones",
    });

    // Blur returns the card to its reading surface with the corrected text.
    fireEvent.blur(editor);
    expect(screen.queryByRole("textbox", { name: "Captured text" })).not.toBeInTheDocument();
    expect(screen.getByText("I really like these headphones")).toBeInTheDocument();

    unmount();
    vi.useRealTimers();
  });

  it("does not write Spec-step title renames back to the inbox item", async () => {
    triageInboxItem.mockResolvedValue({ id: "task-1" });
    renderTriagePage();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    // Spec's title is a reading surface until clicked — most captures don't
    // need renaming, so the editor shouldn't be the default state.
    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Email Sarah"));
    fireEvent.change(await screen.findByRole("textbox", { name: "Title" }), {
      target: { value: "Email Sarah about Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^ready$/i }));

    await waitFor(() => expect(triageInboxItem).toHaveBeenCalled());
    expect(updateInboxItem).not.toHaveBeenCalled();
  });

  it("Back from Spec returns to Classify so the type can be changed", async () => {
    renderTriagePage();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    expect(await screen.findByText(/2 · Specify the task/i)).toBeInTheDocument();

    // Back returns to the classify step — type/lens chooser reappears.
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(await screen.findByText("1 · Classify")).toBeInTheDocument();
    // And the type chooser is reachable again (one-line rows now, so the
    // accessible name is the label + sub-description combined).
    expect(screen.getByRole("button", { name: /project/i })).toBeInTheDocument();
  });

  it("uses a resolved Project as the destination and skips standalone Lens selection", async () => {
    appData.current = {
      lenses: [
        { id: "lens-1", name: "Work", color: "indigo" },
        { id: "lens-2", name: "Me", color: "emerald" },
      ],
    };
    activeLens.current = { id: "lens-2", name: "Me", color: "emerald" };
    inboxItems.current = [
      {
        id: "ix-1",
        text: "Draft MVP plan",
        createdAt: new Date(),
        parsedDate: null,
        parsedLens: null,
        parsedProject: null,
        parsedPriority: null,
        parsedSize: null,
        parsedTags: [],
      },
    ];
    projects.current = [{ id: "project-1", name: "MVP", lensId: "lens-1", goal: null }];
    resolverProjects.current = [{ id: "project-1", name: "MVP", lensId: "lens-1" }];
    triageInboxItem.mockResolvedValue({ id: "task-1" });

    renderTriagePage();

    expect(await screen.findByText("Destination")).toBeInTheDocument();
    expect(screen.getByText("MVP · Work")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Work" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Me" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^ready$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxItemId: "ix-1",
          lensId: "lens-1",
          projectId: "project-1",
        }),
      ),
    );
  });

  it("uses Classify number keys to choose the type before Continue", async () => {
    renderTriagePage();

    // The keymap mirrors the chooser order: Task, List item, Resource,
    // Project, Delete (renumbered 2026-08-18).
    fireEvent.keyDown(window, { key: "2" });
    expect(
      await screen.findByRole("combobox", { name: "Add to list" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "4" });
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));

    expect(await screen.findByText(/2 · Specify the project/i)).toBeInTheDocument();
  });

  it("keeps the current item visible when dispatch fails", async () => {
    renderTriagePage();

    expect(screen.getByText("Email Sarah")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^ready$/i }));

    await waitFor(() => expect(screen.getByText("Server unavailable")).toBeInTheDocument());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    expect(screen.queryByText(/inbox zero/i)).not.toBeInTheDocument();
  });

  it("lets task context be added during Spec and sends it to triage", async () => {
    triageInboxItem.mockResolvedValue({ id: "task-1" });
    renderTriagePage();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    const notes = await screen.findByLabelText(/task context/i);
    fireEvent.change(notes, { target: { value: "  Call out invoice terms  " } });
    fireEvent.click(screen.getByRole("button", { name: /^ready$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({
          inboxItemId: "ix-1",
          content: "Call out invoice terms",
        }),
      ),
    );
  });

  it("lets the title be edited and creates the task with the edited value", async () => {
    triageInboxItem.mockResolvedValue({ id: "task-1" });
    renderTriagePage();

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    const title = await screen.findByRole("textbox", { name: "Title" });
    fireEvent.change(title, { target: { value: "Email Sarah about Q3" } });
    fireEvent.click(screen.getByRole("button", { name: /^ready$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Email Sarah about Q3" }),
      ),
    );
  });

  it("does not trigger triage shortcuts while the title is being edited", () => {
    renderTriagePage();

    expect(screen.queryByRole("textbox", { name: "Title" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    title.focus();
    fireEvent.keyDown(title, { key: "Enter" });

    expect(screen.getByText(/2 · Specify the task/i)).toBeInTheDocument();
    expect(triageInboxItem).not.toHaveBeenCalled();
  });

  it("blocks completion when the title is blank", async () => {
    renderTriagePage();

    fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit title" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Title" }), {
      target: { value: "   " },
    });

    expect(await screen.findByRole("button", { name: /^ready$/i })).toBeDisabled();
  });

  it("shows Inbox zero with a Done action when the inbox is empty", async () => {
    inboxItems.current = [];
    renderTriagePage();
    expect(await screen.findByText("Inbox zero.")).toBeInTheDocument();
    expect(screen.queryByText("1 · Classify")).not.toBeInTheDocument();
  });

  it("wraps to earlier inbox items after starting triage from a row", async () => {
    inboxItems.current = [
      { id: "ix-1", text: "First", createdAt: new Date(), parsedDate: null, parsedLens: null, parsedProject: null, parsedPriority: null, parsedSize: null, parsedTags: [] },
      { id: "ix-2", text: "Middle", createdAt: new Date(), parsedDate: null, parsedLens: null, parsedProject: null, parsedPriority: null, parsedSize: null, parsedTags: [] },
      { id: "ix-3", text: "Last", createdAt: new Date(), parsedDate: null, parsedLens: null, parsedProject: null, parsedPriority: null, parsedSize: null, parsedTags: [] },
    ];
    triageInboxItem.mockResolvedValue({ id: "task-1" });
    renderTriagePage("/do/inbox/review?i=1");

    async function readyCurrent(expectedCallCount: number) {
      fireEvent.click(screen.getByRole("button", { name: /^continue$/i }));
      fireEvent.click(await screen.findByRole("button", { name: /^ready$/i }));
      await waitFor(() => expect(triageInboxItem).toHaveBeenCalledTimes(expectedCallCount));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 350));
      });
    }

    expect(await screen.findByText("Middle")).toBeInTheDocument();
    await readyCurrent(1);
    expect(await screen.findByText("Last")).toBeInTheDocument();
    await readyCurrent(2);
    expect(await screen.findByText("First")).toBeInTheDocument();
    await readyCurrent(3);

    expect(await screen.findByText("Inbox zero.")).toBeInTheDocument();
    expect(triageInboxItem.mock.calls.map(([payload]) => payload.inboxItemId)).toEqual([
      "ix-2", "ix-3", "ix-1",
    ]);
  });

  it("renders a Delete type and dispatches the delete decision on click", async () => {
    triageInboxItem.mockResolvedValue({ id: "deleted-1" });
    renderTriagePage();

    // Choose the Delete type — Continue relabels to "Delete" and commits directly.
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() =>
      expect(triageInboxItem).toHaveBeenCalledWith(
        expect.objectContaining({ inboxItemId: "ix-1", decision: "delete" }),
      ),
    );
    expect(screen.queryByRole("button", { name: /archive/i })).not.toBeInTheDocument();
    // Delete bypasses Spec.
    expect(screen.queryByText(/2 · Specify/i)).not.toBeInTheDocument();
  });
});
