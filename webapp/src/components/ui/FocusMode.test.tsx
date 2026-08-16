import { describe, expect, it, vi } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { FocusMode, type FocusTask } from "./FocusMode";
import { renderInContext } from "wasp/client/test";

// FocusMode — centered session (revised 2026-08-07). These tests pin the component
// contract for the focus surface:
//   1. The center ring counts down the configured focus session.
//   2. The thread renders NOTE vs COMPLETED entries distinctly.
//   3. The composer is summoned via `n` and posts via ⌘↵ (Enter inserts a
//      newline — the composer is dedicated and multi-line).
//   4. Wrap up replaces the working row with the inline reflection before
//      firing onComplete, with an optimistic payoff (title strikes through).
//      The watch freezes while wrapping; Keep working posts the typed
//      reflection as a note and restores the row.
//   5. Esc dismisses composer → confirm → exit, in that order.
//
// Uses fireEvent over user-event (no dep), matching the rest of the suite.

// 18 minutes ago — leaves about seven minutes on a 25-minute countdown.
const STARTED_MS = Date.now() - 18 * 60 * 1000;

const BASE_TASK: FocusTask = {
  id: "task-1",
  title: "Email Sarah",
  project: "Ship v2",
  due: "due today",
  size: "15 min",
  content: "Follow up on the launch retro.",
  startedAt: new Date(STARTED_MS),
  sessionStartedAt: new Date(STARTED_MS),
  focusSessionMinutes: 25,
  sessionComplete: false,
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
      expect(
        screen.getByText(/Follow up on the launch retro/),
      ).toBeInTheDocument();
    });

    it("renders the centered countdown with configured duration", () => {
      const freshStartedAt = new Date(Date.now() - 18 * 60 * 1000);
      renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            startedAt: freshStartedAt,
            sessionStartedAt: freshStartedAt,
          }}
          onClose={() => {}}
        />,
      );
      expect(screen.getByText(/^(06:59|07:00)$/)).toHaveClass(
        "aa-focus-timer__time",
      );
      expect(screen.getByText(/25 min focus/i)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /pause focus session/i }),
      ).toBeInTheDocument();
    });

    it("shows a timer symbol and count for completed focus sessions", () => {
      renderInContext(
        <FocusMode
          task={{ ...BASE_TASK, completedFocusSessions: 3 }}
          onClose={() => {}}
        />,
      );

      const cycles = screen.getByLabelText("3 completed focus sessions");
      expect(cycles.querySelectorAll("svg")).toHaveLength(1);
      expect(cycles).toHaveTextContent("3");
    });

    it("falls back to startedAt for the session clock when no open session is present", () => {
      // Legacy task that has startedAt but no matching session row (migration
      // gap). The clock should still tick using startedAt.
      const freshStartedAt = new Date(Date.now() - 18 * 60 * 1000);
      renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            startedAt: freshStartedAt,
            sessionStartedAt: null,
          }}
          onClose={() => {}}
        />,
      );
      expect(screen.getByText(/^(06:59|07:00)$/)).toBeInTheDocument();
    });

    it("renders a fresh configured duration when no legacy start exists", () => {
      renderInContext(
        <FocusMode
          task={{ ...BASE_TASK, startedAt: null, sessionStartedAt: null }}
          onClose={() => {}}
        />,
      );
      expect(screen.getByText("25:00")).toBeInTheDocument();
    });

    it("records an elapsed focus session without completing the task", async () => {
      const onCompleteSession = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            sessionStartedAt: new Date(Date.now() - 26 * 60_000),
          }}
          onClose={() => {}}
          onCompleteSession={onCompleteSession}
        />,
      );

      await waitFor(() => expect(onCompleteSession).toHaveBeenCalledTimes(1));
    });

    it("offers another session after a countdown is recorded", () => {
      const onStartSession = vi.fn();
      renderInContext(
        <FocusMode
          task={{ ...BASE_TASK, sessionStartedAt: null, sessionComplete: true }}
          onClose={() => {}}
          onStartSession={onStartSession}
        />,
      );

      expect(screen.getByText("00:00")).toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: /start another focus session/i }),
      );
      expect(onStartSession).toHaveBeenCalledTimes(1);
    });

    it("can save edited durable task content", async () => {
      const onSaveContent = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onSaveContent={onSaveContent}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /edit details/i }));
      const editor = screen.getByRole("textbox", {
        name: /task details/i,
      }) as HTMLTextAreaElement;
      fireEvent.change(editor, {
        target: { value: "  Bring the contract notes  " },
      });
      fireEvent.click(screen.getByRole("button", { name: /save details/i }));

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

      fireEvent.click(
        screen.getByRole("button", { name: /add task details/i }),
      );
      fireEvent.change(screen.getByRole("textbox", { name: /task details/i }), {
        target: { value: "Opening call bullets" },
      });
      fireEvent.click(screen.getByRole("button", { name: /save details/i }));

      await waitFor(() =>
        expect(onSaveContent).toHaveBeenCalledWith("Opening call bullets"),
      );
    });
  });

  // ---- Goal rationale (focus-goal-context spec FG04) ----
  // Focus renders a quiet Goal block below the title when a Goal resolves,
  // and renders nothing when it doesn't. The block is passive: no link,
  // editor, focus target, or action. Matcher rationale/continuity are NOT
  // repeated on Focus.
  describe("goal rationale", () => {
    it("renders the described Goal block: question + description + attribution", () => {
      const { container } = renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            goalContext: { name: "Reach 100 paid", description: "Prove demand." },
          }}
          onClose={() => {}}
        />,
      );
      const section = screen.getByRole("region", { name: /goal context/i });
      expect(section).toBeInTheDocument();
      expect(within(section).getByText("Why does this matter?")).toBeInTheDocument();
      expect(within(section).getByText("Prove demand.")).toBeInTheDocument();
      expect(
        within(section).getByText("Goal · Reach 100 paid"),
      ).toBeInTheDocument();
      // Quiet violet attribution.
      expect(container.querySelector(".aa-focus__goal-attribution")).not.toBeNull();
    });

    it("renders the Toward fallback for a description-less Goal, with no attribution line", () => {
      const { container } = renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            goalContext: { name: "Reach 100 paid", description: null },
          }}
          onClose={() => {}}
        />,
      );
      const section = screen.getByRole("region", { name: /goal context/i });
      expect(within(section).getByText("Toward Reach 100 paid.")).toBeInTheDocument();
      // No attribution line in the fallback state.
      expect(container.querySelector(".aa-focus__goal-attribution")).toBeNull();
    });

    it("renders no Goal block when goalContext is null", () => {
      renderInContext(<FocusMode task={BASE_TASK} onClose={() => {}} />);
      expect(
        screen.queryByRole("region", { name: /goal context/i }),
      ).toBeNull();
    });

    it("does not render matcher rationale or continuity on Focus", () => {
      // Focus never shows "why now" or worked-time/notes continuity — its
      // timer + activity thread already provide live + historical context.
      renderInContext(
        <FocusMode
          task={{
            ...BASE_TASK,
            goalContext: { name: "G", description: "desc" },
          }}
          onClose={() => {}}
        />,
      );
      // The Goal block exists; matcher/continuity copy does not.
      expect(screen.getByRole("region", { name: /goal context/i })).toBeInTheDocument();
      expect(screen.queryByText(/min worked/i)).toBeNull();
      expect(screen.queryByText(/latest note/i)).toBeNull();
    });
  });

  // ---- Flow 1: the progress thread ----
  describe("progress thread", () => {
    it("shows the calm empty state when there are no updates", () => {
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={() => {}} onAddNote={vi.fn()} />,
      );
      expect(screen.getByText("No notes yet.")).toBeInTheDocument();
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
      const { container } = renderInContext(
        <FocusMode task={task} onClose={() => {}} />,
      );
      expect(screen.getByText("Drafted the outline")).toBeInTheDocument();
      expect(container.querySelector(".aa-thread__note")).not.toBeNull();
      expect(
        container.querySelector(".aa-thread__note-body")?.textContent,
      ).toBe("Drafted the outline");
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
      const { container } = renderInContext(
        <FocusMode task={task} onClose={() => {}} />,
      );
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
      expect(container.querySelector(".aa-thread__event")).not.toBeNull();
      // A COMPLETED entry must NOT render as a note card.
      expect(container.querySelector(".aa-thread__note")).toBeNull();
    });

    it("renders both NOTE and COMPLETED entries when both are present", () => {
      const task: FocusTask = {
        ...BASE_TASK,
        updates: [
          {
            id: "tu-1",
            body: "Started drafting",
            createdAt: new Date("2026-07-04T09:00:00Z"),
            kind: "NOTE",
          },
          {
            id: "tu-2",
            body: "Completed",
            createdAt: new Date("2026-07-04T09:41:00Z"),
            kind: "COMPLETED",
          },
        ],
      };
      const { container } = renderInContext(
        <FocusMode task={task} onClose={() => {}} />,
      );
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
      const composer = screen.getByPlaceholderText(
        /learn, decide/i,
      ) as HTMLTextAreaElement;
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
      // Save button is disabled when the draft is empty/whitespace.
      expect(screen.getByRole("button", { name: /save note/i })).toBeDisabled();
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
      const composer = screen.getByPlaceholderText(
        /learn, decide/i,
      ) as HTMLTextAreaElement;
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
      const composer = screen.getByPlaceholderText(
        /learn, decide/i,
      ) as HTMLTextAreaElement;
      composer.focus();
      fireEvent.keyDown(composer, { key: "n" });
      // Still open — the in-field keystroke was not hijacked.
      expect(screen.getByPlaceholderText(/learn, decide/i)).toBeInTheDocument();
    });
  });

  // ---- Flow 3: wrap-up — the reflection replaces the working row ----
  // Clicking the explicit Wrap up action (or pressing D) swaps the working
  // row for a calm, optional Outcome panel in the same slot. Only its final
  // action fires onComplete; the op-level behavior is covered in
  // operations.test.ts.
  describe("wrap-up — reflection replaces the working row", () => {
    it("completes a practice task immediately without asking for reflection", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
          skipCompletionReflection
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));

      expect(onComplete).toHaveBeenCalledWith("");
      expect(
        screen.queryByRole("region", { name: /complete task reflection/i }),
      ).toBeNull();
    });

    it("Wrap up replaces the working row with the inline reflection", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
          onAddNote={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      expect(
        screen.getByRole("region", { name: /complete task reflection/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("How did it go?")).toBeInTheDocument();
      expect(
        screen.queryByRole("dialog", { name: /mark this done/i }),
      ).toBeNull();
      // The working row yielded its slot — none of its actions stay live
      // alongside the reflection.
      expect(screen.queryByRole("button", { name: /wrap up/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /^pause$/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /add note/i })).toBeNull();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("pressing D opens the inline reflection", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.keyDown(window, { key: "d" });
      expect(
        screen.getByRole("region", { name: /complete task reflection/i }),
      ).toBeInTheDocument();
    });

    it("the reflection action fires onComplete", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      const reflection = screen.getByRole("region", {
        name: /complete task reflection/i,
      });
      fireEvent.click(
        within(reflection).getByRole("button", { name: /mark complete/i }),
      );
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    // Outcome capture (task-fields §F): the notes area shows an optional
    // reflection. Completing with an empty field passes an empty string;
    // typing a note passes trimmed text.
    it("passes an empty outcome when completing without a note", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      const reflection = screen.getByRole("region", {
        name: /complete task reflection/i,
      });
      fireEvent.click(
        within(reflection).getByRole("button", { name: /mark complete/i }),
      );
      expect(onComplete).toHaveBeenCalledWith("");
    });

    it("passes the typed outcome when completing with a note", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.change(screen.getByLabelText(/completion note optional/i), {
        target: { value: "Shipped the draft to Sarah." },
      });
      const reflection = screen.getByRole("region", {
        name: /complete task reflection/i,
      });
      fireEvent.click(
        within(reflection).getByRole("button", { name: /mark complete/i }),
      );
      expect(onComplete).toHaveBeenCalledWith("Shipped the draft to Sarah.");
    });

    it("bare Enter remains available for a multi-line reflection", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.keyDown(screen.getByLabelText(/completion note optional/i), {
        key: "Enter",
      });
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("⌘↵ completes with the typed outcome", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.change(screen.getByLabelText(/completion note optional/i), {
        target: { value: "Shipped the draft." },
      });
      fireEvent.keyDown(screen.getByLabelText(/completion note optional/i), {
        key: "Enter",
        metaKey: true,
      });
      expect(onComplete).toHaveBeenCalledWith("Shipped the draft.");
    });

    it("Keep working closes the reflection without firing onComplete", () => {
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.click(screen.getByRole("button", { name: /keep working/i }));
      expect(onComplete).not.toHaveBeenCalled();
      expect(
        screen.queryByRole("region", { name: /complete task reflection/i }),
      ).toBeNull();
    });

    it("Keep working posts the typed reflection as a note and restores the row", async () => {
      const onComplete = vi.fn();
      const onAddNote = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
          onAddNote={onAddNote}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.change(screen.getByLabelText(/completion note optional/i), {
        target: { value: "  Halfway there — resume tomorrow  " },
      });
      fireEvent.click(screen.getByRole("button", { name: /keep working/i }));

      await waitFor(() =>
        expect(onAddNote).toHaveBeenCalledWith("Halfway there — resume tomorrow"),
      );
      expect(onComplete).not.toHaveBeenCalled();
      // The working row is back in place.
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /wrap up/i }),
        ).toBeInTheDocument(),
      );
    });

    it("freezes the watch while wrapping and resumes on Keep working", () => {
      vi.useFakeTimers();
      try {
        const onAddNote = vi.fn().mockResolvedValue(undefined);
        const { container } = renderInContext(
          <FocusMode
            task={BASE_TASK}
            onClose={() => {}}
            onComplete={vi.fn()}
            onAddNote={onAddNote}
          />,
        );
        const readTime = () =>
          container.querySelector(".aa-focus-timer__time")?.textContent ?? "";

        fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
        const frozen = readTime();
        act(() => {
          vi.advanceTimersByTime(90_000);
        });
        expect(readTime()).toBe(frozen);

        fireEvent.click(screen.getByRole("button", { name: /keep working/i }));
        act(() => {
          vi.advanceTimersByTime(90_000);
        });
        expect(readTime()).not.toBe(frozen);
      } finally {
        vi.useRealTimers();
      }
    });

    it("restores the reflection and typed outcome when completion fails", async () => {
      const onComplete = vi.fn().mockRejectedValue(new Error("offline"));
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={() => {}}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.change(screen.getByLabelText(/completion note optional/i), {
        target: { value: "Keep this outcome" },
      });
      const reflection = screen.getByRole("region", {
        name: /complete task reflection/i,
      });
      fireEvent.click(
        within(reflection).getByRole("button", { name: /mark complete/i }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /could not complete/i,
      );
      expect(screen.getByLabelText(/completion note optional/i)).toHaveValue(
        "Keep this outcome",
      );
    });
  });

  // ---- Flow 4: Esc dismisses composer → exit ----
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

    it("Esc closes the completion reflection without exiting focus", () => {
      const onClose = vi.fn();
      const onComplete = vi.fn();
      renderInContext(
        <FocusMode
          task={BASE_TASK}
          onClose={onClose}
          onComplete={onComplete}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /wrap up/i }));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(
        screen.queryByRole("region", { name: /complete task reflection/i }),
      ).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();
    });

    it("Esc closes the snooze sheet without exiting focus", () => {
      const onClose = vi.fn();
      const onSnooze = vi.fn();
      renderInContext(
        <FocusMode task={BASE_TASK} onClose={onClose} onSnooze={onSnooze} />,
      );
      // Open the snooze sheet via the "Not now" button.
      fireEvent.click(screen.getByRole("button", { name: /not now/i }));
      expect(
        screen.getByRole("dialog", { name: /not now/i }),
      ).toBeInTheDocument();
      // Esc should close the sheet, not exit focus.
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: /not now/i })).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      expect(onSnooze).not.toHaveBeenCalled();
    });
  });
});
