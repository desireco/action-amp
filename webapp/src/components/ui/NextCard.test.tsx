import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { NextCard, type NextTask } from "./NextCard";
import { renderInContext } from "wasp/client/test";

// NextCard — the composite task card (the product wedge). Title → meta →
// amber "why" → Start / Not now (Next) or Start / Pause (Now). The primary
// button is always "Start" (starts the task if needed, then opens focus).
// Completion happens in focus mode, not on this card, so there's no
// completion control here. Tests render + the callbacks + conditional "why".

const BASE_TASK: NextTask = {
  title: "Email Sarah",
  project: "Ship v2",
  due: "due today",
  size: "15 min",
};

describe("NextCard", () => {
  describe("rendering", () => {
    it("shows the task title", () => {
      renderInContext(<NextCard task={BASE_TASK} />);
      expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    });

    it("shows project + due + size in the meta line", () => {
      renderInContext(<NextCard task={BASE_TASK} />);
      expect(screen.getByText("Ship v2")).toBeInTheDocument();
      expect(screen.getByText("due today")).toBeInTheDocument();
      expect(screen.getByText("15 min")).toBeInTheDocument();
    });

    it("shows the captured images as centered thumbs when the task carries them", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            attachments: [
              { id: "att-1", filename: "error-shot.png" },
              { id: "att-2", filename: "trace.jpg" },
            ],
          }}
        />,
      );
      // The real thing on stage — one <img> per attachment, alt = filename.
      expect(screen.getByAltText("error-shot.png")).toBeInTheDocument();
      expect(screen.getByAltText("trace.jpg")).toBeInTheDocument();
      // No count chip in the meta row — the images replaced it.
      expect(screen.queryByText(/images?/i)).toBeNull();
    });

    it("renders no attachment block when the task has none", () => {
      renderInContext(<NextCard task={BASE_TASK} />);
      expect(screen.queryByAltText(/\.(png|jpe?g|gif|webp)$/i)).toBeNull();
    });

    it("shows the context line when provided", () => {
      renderInContext(
        <NextCard task={BASE_TASK} context="Right now · 30 min available" />,
      );
      expect(screen.getByText(/Right now/)).toBeInTheDocument();
    });
  });

  describe("conditional 'why' line", () => {
    it("shows the why text when provided", () => {
      const { container } = renderInContext(
        <NextCard task={{ ...BASE_TASK, why: "Top priority for", whyEmphasis: "Q3" }} />,
      );
      const why = container.querySelector(".aa-wn-card__why");
      expect(why).not.toBeNull();
      expect(why!.textContent).toMatch(/Top priority for.*Q3/);
    });

    it("omits the why line when not provided", () => {
      const { container } = renderInContext(<NextCard task={BASE_TASK} />);
      expect(container.querySelector(".aa-wn-card__why")).toBeNull();
    });

    // Regression guard: a NORMAL-priority reason with no lead (e.g. "Overdue")
    // arrives as detail-only and must still render. The what-now wiring
    // promotes detail to `why` when there's no lead; this asserts the card
    // renders the line off a lone `why` (no whyEmphasis) too.
    it("renders a detail-only reason (why without whyEmphasis)", () => {
      const { container } = renderInContext(
        <NextCard task={{ ...BASE_TASK, why: "Overdue" }} />,
      );
      const why = container.querySelector(".aa-wn-card__why");
      expect(why).not.toBeNull();
      expect(why!.textContent).toMatch(/Overdue/);
    });
  });

  // ---- Goal rationale + paused-work continuity (focus-goal-context spec FG05) ----
  // Both blocks render ONLY in the `next` candidate state, after the matcher
  // rationale. Goal uses violet attribution (never amber). Continuity shows a
  // stats row + optional two-line latest-note preview; zero segments are
  // suppressed. The `now` state shows neither.
  describe("goal rationale + continuity (next state)", () => {
    it("renders the described Goal: question + answer + violet attribution", () => {
      const { container } = renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            goalContext: { name: "Reach 100 paid", description: "Prove demand." },
          }}
        />,
      );
      const section = screen.getByRole("region", {
        name: /goal and previous work/i,
      });
      expect(within(section).getByText("Why does this matter?")).toBeInTheDocument();
      expect(within(section).getByText("Prove demand.")).toBeInTheDocument();
      expect(
        within(section).getByText("Goal · Reach 100 paid"),
      ).toBeInTheDocument();
      expect(container.querySelector(".aa-wn-card__goal-attribution")).not.toBeNull();
    });

    it("renders the Toward fallback for a description-less Goal (no attribution)", () => {
      const { container } = renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            goalContext: { name: "Reach 100 paid", description: null },
          }}
        />,
      );
      expect(
        screen.getByText("Toward Reach 100 paid."),
      ).toBeInTheDocument();
      expect(container.querySelector(".aa-wn-card__goal-attribution")).toBeNull();
    });

    it("renders no Goal block when goalContext is null", () => {
      renderInContext(<NextCard task={BASE_TASK} />);
      expect(
        screen.queryByRole("region", { name: /goal and previous work/i }),
      ).toBeNull();
    });

    it("renders a combined stats row: worked · sessions · notes", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            continuityStats: "42 min worked · 2 sessions · 3 notes",
          }}
        />,
      );
      expect(
        screen.getByText("42 min worked · 2 sessions · 3 notes"),
      ).toBeInTheDocument();
    });

    it("renders time-only continuity (no notes)", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            continuityStats: "25 min worked · 1 session",
            latestNote: null,
          }}
        />,
      );
      expect(screen.getByText("25 min worked · 1 session")).toBeInTheDocument();
      expect(screen.queryByText(/latest note/i)).toBeNull();
    });

    it("renders notes-only continuity (no worked time)", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            continuityStats: "2 notes",
            latestNote: "Decided on scope.",
          }}
        />,
      );
      expect(screen.getByText("2 notes")).toBeInTheDocument();
      expect(screen.getByText("Decided on scope.")).toBeInTheDocument();
    });

    it("renders the latest note under a 'Latest note' label as passive plain text", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            continuityStats: "1 note",
            latestNote: "Switched to the async API.",
          }}
        />,
      );
      expect(screen.getByText(/latest note/i)).toBeInTheDocument();
      expect(screen.getByText("Switched to the async API.")).toBeInTheDocument();
    });

    it("renders no continuity block when continuityStats is null (fresh task)", () => {
      renderInContext(
        <NextCard task={{ ...BASE_TASK, continuityStats: null, latestNote: null }} />,
      );
      // No purpose section at all when both Goal and continuity are absent.
      expect(
        screen.queryByRole("region", { name: /goal and previous work/i }),
      ).toBeNull();
    });

    it("suppresses zero segments — empty continuity renders no block", () => {
      // A null stats row (resolveContinuity found nothing) means no row, no
      // empty prompt, no zero counts.
      renderInContext(
        <NextCard task={{ ...BASE_TASK, continuityStats: null }} />,
      );
      expect(screen.queryByText(/0 min/i)).toBeNull();
      expect(screen.queryByText(/0 sessions/i)).toBeNull();
      expect(screen.queryByText(/0 notes/i)).toBeNull();
    });

    it("renders Goal and continuity together when both are present", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            goalContext: { name: "G", description: "desc" },
            continuityStats: "10 min worked · 1 note",
            latestNote: "hi",
          }}
        />,
      );
      const section = screen.getByRole("region", {
        name: /goal and previous work/i,
      });
      expect(within(section).getByText("desc")).toBeInTheDocument();
      expect(within(section).getByText("10 min worked · 1 note")).toBeInTheDocument();
    });
  });

  describe("now state suppression (focus-goal-context)", () => {
    it("does NOT render Goal or continuity in the now state", () => {
      renderInContext(
        <NextCard
          task={{
            ...BASE_TASK,
            goalContext: { name: "G", description: "desc" },
            continuityStats: "10 min worked · 1 note",
            latestNote: "hi",
          }}
          state="now"
        />,
      );
      // The purpose section is exclusive to the `next` candidate state.
      expect(
        screen.queryByRole("region", { name: /goal and previous work/i }),
      ).toBeNull();
      expect(screen.queryByText(/10 min worked/i)).toBeNull();
      expect(screen.queryByText("Why does this matter?")).toBeNull();
    });
  });

  describe("actions — Next state (default)", () => {
    it("'Start' fires onDo with the task", () => {
      const onDo = vi.fn();
      renderInContext(<NextCard task={BASE_TASK} onDo={onDo} />);

      fireEvent.click(screen.getByRole("button", { name: /start/i }));
      expect(onDo).toHaveBeenCalledWith(BASE_TASK);
    });

    it("'Not now' fires onNotNow with the task", () => {
      const onNotNow = vi.fn();
      renderInContext(<NextCard task={BASE_TASK} onNotNow={onNotNow} />);

      fireEvent.click(screen.getByRole("button", { name: /not now/i }));
      expect(onNotNow).toHaveBeenCalledWith(BASE_TASK);
    });
  });

  describe("actions — Now state (in progress)", () => {
    it("'Start' fires onDo with the task", () => {
      const onDo = vi.fn();
      renderInContext(<NextCard task={BASE_TASK} state="now" onDo={onDo} />);

      fireEvent.click(screen.getByRole("button", { name: /start/i }));
      expect(onDo).toHaveBeenCalledWith(BASE_TASK);
    });

    it("'Pause' fires onPause with the task (Now → Next, same task)", () => {
      const onPause = vi.fn();
      renderInContext(<NextCard task={BASE_TASK} state="now" onPause={onPause} />);

      fireEvent.click(screen.getByRole("button", { name: /pause/i }));
      expect(onPause).toHaveBeenCalledWith(BASE_TASK);
    });
  });
});
