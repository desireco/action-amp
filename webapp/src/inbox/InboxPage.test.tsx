import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInboxItems = vi.fn();
const queryState = {
  current: { data: [] as InboxItem[], isLoading: false },
};

interface InboxItem {
  id: string;
  text: string;
  createdAt: Date;
  parsedDate: Date | null;
  parsedProject: string | null;
  parsedPriority: string | null;
  parsedSize: string | null;
  parsedTags: string[];
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
    parsedDate: null,
    parsedProject: null,
    parsedPriority: null,
    parsedSize: null,
    parsedTags: [],
  };
}

function renderInbox() {
  return render(
    <MemoryRouter>
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

    expect(screen.getByRole("heading", { name: "Inbox clear" })).toBeInTheDocument();
    expect(screen.getByText(/capture anytime/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /start triage/i })).not.toBeInTheDocument();
  });

  it("keeps the queue count and triage action together for one item", () => {
    queryState.current = { data: [item("one", "Email Sarah")], isLoading: false };
    renderInbox();

    expect(screen.getByText(/1 captured thought · newest first/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /start triage/i })).toHaveAttribute(
      "href",
      "/app/inbox/review",
    );
    expect(screen.getByRole("link", { name: /email sarah/i })).toHaveAttribute(
      "href",
      "/app/inbox/review?i=0",
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

    expect(screen.getByText(/20 captured thoughts · newest first/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
  });

  it("shows a stable loading surface instead of flashing the empty state", () => {
    queryState.current = { data: [], isLoading: true };
    renderInbox();

    expect(screen.getByLabelText("Loading inbox")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Inbox clear" })).not.toBeInTheDocument();
  });
});
