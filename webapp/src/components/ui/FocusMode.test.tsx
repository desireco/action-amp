import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { FocusMode, type FocusTask } from "./FocusMode";
import { renderInContext } from "wasp/client/test";

// FocusMode — Variant F (locked 2026-07-05). These tests pin the component
// contract for the focus surface:
//   1. The margin clock derives elapsed time from `task.startedAt`.
//   2. The thread renders NOTE vs COMPLETED entries distinctly.
//   3. The composer is summoned via `n` and posts via ⌘↵ (Enter inserts a
//      newline — the composer is dedicated and multi-line).
//   4. Completion opens a confirm dialog before firing onComplete, with an
//      optimistic payoff (circle fills, title strikes through).
//   5. Esc dismisses composer → confirm → exit, in that order.
//
// Uses fireEvent over user-event (no dep), matching the rest of the suite.

// 18 minutes ago — gives a stable "18" for the margin clock assertion.
const STARTED_MS = Date.now() - 18 * 60 * 1000;

const BASE_TASK: FocusTask = {
  id: "task-1",
  title: "Email Sarah",
  project: "Ship v2",
  due: "due today",
  size: "15 min",
  content: "Follow up on the launch retro.",
  startedAt: new Date(STARTED_MS),
  updates: [],
};

describe("FocusMode", () => {
  describe("rendering", () => {
    it("shows the task title in a dialog", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(
        screen.getByRole("dialog", { name: /Focus: Email Sarah/ }),
      ).toBeInTheDocument();
    });

    it("renders durable task content", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(screen.getByText(/Follow up on the launch retro/)).toBeInTheDocument();
    });

    it("renders the margin clock with elapsed minutes from startedAt", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      // 18 minutes elapsed (STARTED_MS is 18 min ago). The clock shows the
      // number + the "min in" unit.
      const clock = screen.getByText("18");
      expect(clock).toHaveClass("aa-clock__num");
      expect(screen.getByText(/min in/i)).toBeInTheDocument();
      expect(screen.getByText(/in focus/i)).toBeInTheDocument();
    });

    it("renders a placeholder when startedAt is null", () => {
      renderInContext(
        <FocusMode task={{ ...BASE_TASK, startedAt: null }} onClose={() => {}} />,
      );
      expect(screen.getByText("—")).toBeInTheDocument();
    });

    it("can save edited durable task content", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onSaveContent={onSaveContent} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
      const editor = screen.getByLabelText(/task notes/i) as HTMLTextAreaElement;
      fireEvent.change(editor, { target: { value: "  Bring the contract notes  " } });
      fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

      await waitFor(() =>
        expect(onSaveContent).toHaveBeenCalledWith("Bring the contract notes"),
      );
    });

    it("can add durable task content when none exists yet", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode
          task={{ ...BASE_TASK, content: null }}
          onClose={() => {}}
          onSaveContent={onSaveContent}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /add notes/i }));
      fireEvent.change(screen.getByLabelText(/task notes/i), {
        target: { value: "Opening call bullets" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save notes/i }));

      await waitFor(() =>
        expect(onSaveContent).toHaveBeenCalledWith("Opening call bullets"),
      );
    });
  });

  // ---- Flow 1: the progress thread ----
  describe("progress thread", () => {
    it("shows the empty hint when there are no updates and onAddNote is wired", () => {
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={vi.fn()} />,
      );
      // Empty state doubles as a keyboard hint pointing at the `n` shortcut.
      expect(screen.getByText(/press/i)).toBeInTheDocument();
      expect(screen.getByText(/to add a note/i)).toBeInTheDocument();
    });

    it("renders a user NOTE as a note row with body + time", () => {
      const task: FocusTask = {
        ...BASE_TASK,
        updates: [
          {
            id: "tu-1",
            body: "Drafted the outline",
            createdAt: new Date("2026-07-04T09:41:00Z"),
            kind: "NOTE",
          },
        ],
      };
      const { container } = renderInContext(<FocusMode task={task} onClose={() => {}} />);
      expect(screen.getByText("Drafted the outline")).toBeInTheDocument();
      expect(container.querySelector(".aa-thread__note")).not.toBeNull();
      expect(container.querySelector(".aa-thread__note-body")?.textContent).toBe(
        "Drafted the outline",
      );
      expect(container.querySelector(".aa-thread__time")).not.toBeNull();
      // No COMPLETED system row when only a note is present.
      expect(container.querySelector(".aa-thread__event")).toBeNull();
    });

    it("renders a COMPLETED entry as a distinct muted system row, not a note", () => {
      const task: FocusTask = {
        ...BASE_TASK,
        updates: [
          {
            id: "tu-2",
            body: "Completed",
            createdAt: new Date("2026-07-04T09:41:00Z"),
            kind: "COMPLETED",
          },
        ],
      };
      const { container } = renderInContext(<FocusMode task={task} onClose={() => {}} />);
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
      expect(container.querySelector(".aa-thread__event")).not.toBeNull();
      // A COMPLETED entry must NOT render as a note card.
      expect(container.querySelector(".aa-thread__note")).toBeNull();
    });

    it("renders both NOTE and COMPLETED entries when both are present", () => {
      const task: FocusTask = {
        ...BASE_TASK,
        updates: [
          { id: "tu-1", body: "Started drafting", createdAt: new Date("2026-07-04T09:00:00Z"), kind: "NOTE" },
          { id: "tu-2", body: "Completed", createdAt: new Date("2026-07-04T09:41:00Z"), kind: "COMPLETED" },
        ],
      };
      const { container } = renderInContext(<FocusMode task={task} onClose={() => {}} />);
      const notes = container.querySelectorAll(".aa-thread__note");
      const events = container.querySelectorAll(".aa-thread__event");
      expect(notes).toHaveLength(1);
      expect(events).toHaveLength(1);
    });
  });

  // ---- Flow 2: summoned composer (press N, post via ⌘↵) ----
  describe("composer — summoned via N, posts via ⌘↵", () => {
    it("summons the composer when `n` is pressed (window-scoped)", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      // Composer is not present initially.
      expect(screen.queryByPlaceholderText(/learn, decide/i)).toBeNull();
      fireEvent.keyDown(window, { key: "n" });
      expect(screen.getByPlaceholderText(/learn, decide/i)).toBeInTheDocument();
    });

    it("posts a non-empty note via ⌘↵ and closes the composer", async () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      fireEvent.keyDown(window, { key: "n" });
      const composer = screen.getByPlaceholderText(/learn, decide/i) as HTMLTextAreaElement;
      fireEvent.change(composer, { target: { value: "  Ship it  " } });
      fireEvent.keyDown(composer, { key: "Enter", metaKey: true });

      await waitFor(() => expect(onAddNote).toHaveBeenCalledWith("Ship it"));
      // Composer closes once the op resolves.
      await waitFor(() =>
        expect(screen.queryByPlaceholderText(/learn, decide/i)).toBeNull(),
      );
    });

    it("blocks an empty/whitespace submit (Post disabled, no onAddNote call)", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      fireEvent.keyDown(window, { key: "n" });
      const composer = screen.getByPlaceholderText(/learn, decide/i);
      fireEvent.change(composer, { target: { value: "   " } });
      // Post button is disabled when the draft is empty/whitespace.
      expect(screen.getByRole("button", { name: /post note/i })).toBeDisabled();
      // ⌘↵ doesn't fire either — submitNote bails on empty body.
      fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
      expect(onAddNote).not.toHaveBeenCalled();
    });

    it("plain Enter inserts a newline (does not post)", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      fireEvent.keyDown(window, { key: "n" });
      const composer = screen.getByPlaceholderText(/learn, decide/i) as HTMLTextAreaElement;
      fireEvent.change(composer, { target: { value: "two lines" } });
      fireEvent.keyDown(composer, { key: "Enter" });
      expect(onAddNote).not.toHaveBeenCalled();
    });

    it("does not summon the composer when `n` is pressed while typing", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      // Open the composer, focus it, then press `n` to type into it — the
      // global handler must not toggle it closed.
      fireEvent.keyDown(window, { key: "n" });
      const composer = screen.getByPlaceholderText(/learn, decide/i) as HTMLTextAreaElement;
      composer.focus();
      fireEvent.keyDown(composer, { key: "n" });
      // Still open — the in-field keystroke was not hijacked.
      expect(screen.getByPlaceholderText(/learn, decide/i)).toBeInTheDocument();
    });
  });

  // ---- Flow 3: completion is gated behind a confirm dialog ----
  // Clicking the hero circle (or pressing Enter) opens a calm confirm that
  // shows the elapsed time. Only confirming fires onComplete — the op-level
  // behavior (stamps isDone + completedAt + writes COMPLETED row) is covered
  // in operations.test.ts.
  describe("completion — confirm before firing", () => {
    it("clicking the hero circle opens the confirm dialog", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onComplete={onComplete} />,
      );
      // Circle is a button labelled "Mark complete".
      fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));
      expect(
        screen.getByRole("dialog", { name: /mark this done/i }),
      ).toBeInTheDocument();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("pressing Enter opens the confirm dialog", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onComplete={onComplete} />,
      );
      fireEvent.keyDown(window, { key: "Enter" });
      expect(
        screen.getByRole("dialog", { name: /mark this done/i }),
      ).toBeInTheDocument();
    });

    it("confirming fires onComplete (the focus → complete path)", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onComplete={onComplete} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));
      fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("cancelling closes the confirm without firing onComplete", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onComplete={onComplete} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));
      fireEvent.click(screen.getByRole("button", { name: /not yet/i }));
      expect(onComplete).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog", { name: /mark this done/i })).toBeNull();
    });
  });

  // ---- Flow 4: Esc dismisses composer → confirm → exit ----
  describe("Esc — topmost layer wins", () => {
    it("Esc exits focus when nothing else is open", () => {
      const onClose = vi.fn();
      renderInContext(<FocusMode task={BASE_TASK} onClose={onClose} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Esc closes the composer without exiting focus", () => {
      const onClose = vi.fn();
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={onClose} onAddNote={onAddNote} />,
      );
      fireEvent.keyDown(window, { key: "n" });
      expect(screen.getByPlaceholderText(/learn, decide/i)).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByPlaceholderText(/learn, decide/i)).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("Esc closes the confirm dialog without exiting focus", () => {
      const onClose = vi.fn();
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={onClose} onComplete={onComplete} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /mark complete/i }));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: /mark this done/i })).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });
  });
});
