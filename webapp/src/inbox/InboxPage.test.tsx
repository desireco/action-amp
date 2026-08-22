import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInboxItems = vi.fn();
const queryState = {
  // SAFETY: test fixture; empty array narrowed to InboxItem[] for type compatibility.
  current: { data: [] as InboxItem[], isLoading: false },
};

interface InboxItem {
  id: string;
  text: string;
  title?: string | null;
  content?: string | null;
  createdAt: Date;
  parsedScheduledDate: Date | null;
  parsedProject: string | null;
  parsedPriority: string | null;
  parsedSize: string | null;
  parsedTags: string[];
  attachments: { id: string; filename: string; mimeType: string }[];
}

vi.mock("wasp/client/operations", () => ({
  getInboxItems,
  useQuery: () => queryState.current,
}));

const { InboxPage } = await import("./InboxPage");

function item(id: string, text: string): InboxItem {
  return {
    id,
    text,
    createdAt: new Date(),
    parsedScheduledDate: null,
    parsedProject: null,
    parsedPriority: null,
    parsedSize: null,
    parsedTags: [],
    attachments: [],
  };
}

function renderInbox(path = "/do/inbox") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InboxPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  queryState.current = { data: [], isLoading: false };
});

describe("InboxPage", () => {
  it("renders a deliberate empty state without a triage action", () => {
    renderInbox();

    expect(
      screen.getByRole("heading", { name: "Inbox clear" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/capture anytime/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /start triage/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the queue count and triage action together for one item", () => {
    queryState.current = {
      data: [item("one", "Email Sarah")],
      isLoading: false,
    };
    renderInbox();

    expect(
      screen.getByText(/1 captured thought · newest first/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start triage/i })).toHaveAttribute(
      "href",
      "/do/inbox/review",
    );
    expect(screen.getByRole("link", { name: /triage.*email sarah/i })).toHaveAttribute(
      "href",
      "/do/inbox/review?i=0",
    );
  });

  it("renders a large queue as one ordered, scannable surface", () => {
    queryState.current = {
      data: Array.from({ length: 20 }, (_, index) =>
        item(`item-${index}`, `Captured thought ${index + 1}`),
      ),
      isLoading: false,
    };
    renderInbox();

    expect(
      screen.getByText(/20 captured thoughts · newest first/i),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
  });

  it("does not repeat legacy shared text when it is also stored as the body", () => {
    queryState.current = {
      data: [
        {
          ...item("shared", "Modern watch face https://example.com/watch"),
          content: "Modern watch face https://example.com/watch",
        },
      ],
      isLoading: false,
    };
    renderInbox();

    expect(screen.getAllByText("Modern watch face")).toHaveLength(1);
    // The URL appears once (title only — the duplicate body is suppressed)
    // and renders as a real link, not raw text.
    const url = screen.getAllByRole("link", {
      name: "https://example.com/watch",
    });
    expect(url).toHaveLength(1);
    expect(url[0]).toHaveAttribute("href", "https://example.com/watch");
    expect(url[0]).toHaveAttribute("target", "_blank");
  });

  it("linkifies bare URLs in the captured text without losing the triage target", () => {
    queryState.current = {
      data: [item("url", "Read https://example.com/guide, then www.foo.dev.")],
      isLoading: false,
    };
    renderInbox();

    const guide = screen.getByRole("link", { name: "https://example.com/guide" });
    expect(guide).toHaveAttribute("href", "https://example.com/guide");
    expect(guide).toHaveAttribute("target", "_blank");
    expect(guide).toHaveAttribute("rel", "noopener noreferrer");
    // Bare www host gets the https scheme; trailing punctuation stays text.
    expect(screen.getByRole("link", { name: "www.foo.dev" })).toHaveAttribute(
      "href",
      "https://www.foo.dev",
    );
    // The row still navigates to triage via its stretched link.
    expect(
      screen.getByRole("link", { name: /triage.*read https:\/\/example/i }),
    ).toHaveAttribute("href", "/do/inbox/review?i=0");
  });

  it("keeps a distinct structured share body under its title", () => {
    queryState.current = {
      data: [
        {
          ...item("shared", "Article: Read this later — https://example.com"),
          title: "Article",
          content: "Read this later",
        },
      ],
      isLoading: false,
    };
    renderInbox();

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Read this later")).toBeInTheDocument();
    expect(
      screen.queryByText("Article: Read this later — https://example.com"),
    ).not.toBeInTheDocument();
  });

  it("shows a stable loading surface instead of flashing the empty state", () => {
    queryState.current = { data: [], isLoading: true };
    renderInbox();

    expect(screen.getByLabelText("Loading inbox")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Inbox clear" }),
    ).not.toBeInTheDocument();
  });

  it("focuses the exact item addressed by a search destination", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    });
    queryState.current = {
      data: [item("other", "Other note"), item("target", "Target note")],
      isLoading: false,
    };

    renderInbox("/do/inbox?item=target");

    const row = document.getElementById("inbox-item-target");
    expect(row).toHaveClass("is-search-target");
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
