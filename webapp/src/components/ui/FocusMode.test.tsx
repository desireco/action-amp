import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { FocusMode, type FocusTask } from "./FocusMode";
import { renderInContext } from "wasp/client/test";

// FocusMode — full-screen single-task view + the activity thread + composer
// (docs/specs/task-notes-completion-log.md). These tests pin the two spec UI
// flows at the component level:
//   1. The thread renders NOTE vs COMPLETED entries distinctly, the empty
//      state reads "No notes yet.", and the composer posts a note via onAddNote
//      on Enter (and blocks empty submits).
//   2. The Complete button is wired to onComplete — the focus-mode exit that
//      stamps Task.completedAt and writes the COMPLETED event (covered at the
//      op level in operations.test.ts; getDoneToday surfaces it via completedAt).
//
// Uses fireEvent over user-event (no dep), matching the rest of the suite.

const BASE_TASK: FocusTask = {
  id: "task-1",
  title: "Email Sarah",
  project: "Ship v2",
  due: "due today",
  size: "15 min",
  content: "Follow up on the launch retro.",
  updates: [],
};

describe("FocusMode", () => {
  describe("rendering", () => {
    it("shows the task title in a dialog", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(screen.getByRole("dialog", { name: /Focus: Email Sarah/ })).toBeInTheDocument();
    });

    it("renders durable task content", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(screen.getByText(/Follow up on the launch retro/)).toBeInTheDocument();
    });

    it("can save edited durable task content", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onSaveContent={onSaveContent} />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit notes/i }));
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

  // ---- Flow 1: the activity thread + composer ----
  describe("activity thread", () => {
    it("shows the calm empty state when there are no updates", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(screen.getByText(/No notes yet/)).toBeInTheDocument();
    });

    it("renders a user NOTE as a note card with body + time", () => {
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
      // A NOTE renders as a card (with a body + time element), not a system row.
      expect(container.querySelector(".aa-focus__note")).not.toBeNull();
      expect(container.querySelector(".aa-focus__note-body")?.textContent).toBe(
        "Drafted the outline",
      );
      expect(container.querySelector(".aa-focus__note-time")).not.toBeNull();
      // No COMPLETED system row when only a note is present.
      expect(container.querySelector(".aa-focus__event")).toBeNull();
    });

    it("renders a COMPLETED entry as a distinct muted system row, not a note card", () => {
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
      // System rows are labelled "Completed · <time>" so the timeline reads as
      // an activity feed, not a uniform note list.
      expect(screen.getByText(/Completed ·/)).toBeInTheDocument();
      expect(container.querySelector(".aa-focus__event")).not.toBeNull();
      // A COMPLETED entry must NOT render as a note card.
      expect(container.querySelector(".aa-focus__note")).toBeNull();
    });

    it("interleaves notes and system events in chronological order", () => {
      const task: FocusTask = {
        ...BASE_TASK,
        updates: [
          { id: "tu-1", body: "Started drafting", createdAt: new Date("2026-07-04T09:00:00Z"), kind: "NOTE" },
          { id: "tu-2", body: "Completed", createdAt: new Date("2026-07-04T09:41:00Z"), kind: "COMPLETED" },
        ],
      };
      const { container } = renderInContext(<FocusMode task={task} onClose={() => {}} />);
      const items = Array.from(container.querySelectorAll(".aa-focus__thread > li"));
      // Two entries, NOTE first then COMPLETED — the order getTask returns.
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveClass("aa-focus__note");
      expect(items[1]).toHaveClass("aa-focus__event");
    });
  });

  describe("composer — adding a note (Enter to post)", () => {
    it("posts a non-empty note via onAddNote on Enter and clears the field", async () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      const composer = screen.getByPlaceholderText(/Add a note/) as HTMLTextAreaElement;
      fireEvent.change(composer, { target: { value: "  Ship it  " } });
      fireEvent.keyDown(composer, { key: "Enter" });

      // Body is trimmed before being handed to the op (matches addTaskUpdate).
      await waitFor(() => expect(onAddNote).toHaveBeenCalledWith("Ship it"));
      // The composer clears once the op resolves.
      await waitFor(() => expect(composer.value).toBe(""));
    });

    it("blocks an empty/whitespace submit (no onAddNote call)", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      const composer = screen.getByPlaceholderText(/Add a note/);
      fireEvent.change(composer, { target: { value: "   " } });
      fireEvent.keyDown(composer, { key: "Enter" });
      expect(onAddNote).not.toHaveBeenCalled();
    });

    it("Shift+Enter inserts a newline instead of submitting", () => {
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={onAddNote} />,
      );
      const composer = screen.getByPlaceholderText(/Add a note/) as HTMLTextAreaElement;
      fireEvent.change(composer, { target: { value: "two lines" } });
      fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
      expect(onAddNote).not.toHaveBeenCalled();
    });
  });

  // ---- Flow 2: completion is wired to onComplete ----
  // The Complete button is the only completion affordance in focus mode. The
  // op-level test (operations.test.ts) verifies completeTaskFromFocus stamps
  // isDone + completedAt and writes one COMPLETED row; getDoneToday surfaces
  // completed tasks via completedAt. This asserts the button actually fires
  // the wired handler.
  describe("Complete from focus", () => {
    it("the Done button fires onComplete (the focus → complete path)", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onComplete={onComplete} />,
      );
      fireEvent.click(screen.getByRole("button", { name: /done/i }));
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("Esc fires onClose (focus exit)", () => {
      const onClose = vi.fn();
      renderInContext(<FocusMode task={BASE_TASK} onClose={onClose} />);
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
