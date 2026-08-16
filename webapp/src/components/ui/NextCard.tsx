import { useState, type ReactNode } from "react";
import { Button } from "./Button";
import type { GoalContext } from "../../app/taskContext";
import "./NextCard.css";

export interface NextTask {
  /** The thing to do */
  title: string;
  /** Project this task belongs to */
  project?: string;
  /** Human due label (e.g. "due today", "due Friday") */
  due?: string;
  /** Size label (e.g. "15 min", "XL") */
  size?: string;
  /** The reason this is next (rendered as the amber "why" line) */
  why?: string;
  /** Whether the "why" reason is emphasized (renders strong in amber) */
  whyEmphasis?: string;
  /** Optional Goal rationale (focus-goal-context). Rendered only in the
   *  `next` candidate state, after the matcher rationale. Null → no block. */
  goalContext?: GoalContext | null;
  /** Optional continuity stats row, e.g. "42 min worked · 2 sessions · 3 notes".
   *  Rendered only in the `next` state, only when non-null. Null → no row. */
  continuityStats?: string | null;
  /** Optional newest NOTE preview (passive plain text, two-line clamp). Rendered
   *  only in the `next` state under a `Latest note` label, only when non-null. */
  latestNote?: string | null;
  /** Captured image count — calm text chip in the meta row. The chooser stays
   *  media-free; the images themselves live in Focus and the task detail. */
  imageCount?: number;
}

interface NextCardProps {
  /** The task to display */
  task: NextTask;
  /** Context line above the card (e.g. "Now in Work"). Accepts a node so the
   * lens name can carry its identity color separately from the state half. */
  context?: ReactNode;
  /** Called when the user defers ("Not now") */
  onNotNow?: (task: NextTask) => void;
  /** Called when the user clicks "Start" — starts the task (if not already
   *  started) and opens focus mode. */
  onDo?: (task: NextTask) => void;
  /** "next" = candidate (default); "now" = in progress. Swaps the secondary
   *  button (Not now vs Pause). The primary is always "Start". */
  state?: "next" | "now";
  /** Pause (Now → Next, same task stays as the candidate). */
  onPause?: (task: NextTask) => void;
}

/**
 * NextCard — the composite task card. The product's wedge.
 *
 * Centered, single-task chooser. Task title → meta line → amber "why" line →
 * Start / Not now (or Do this / Pause when in progress). There is no completion
 * control on the card itself — completing a task happens in focus mode, reached
 * via "Do this".
 *
 * From app-shell-whatnow.html + landing-home.html prototypes.
 * The app-shell version is flat (no card chrome); the landing version wraps
 * it in an elevated card. This component is the flat app-shell variant.
 */
export function NextCard({ task, context, onNotNow, onDo, state = "next", onPause }: NextCardProps) {
  const [doing, setDoing] = useState(false);

  const handleDo = () => {
    setDoing(true);
    onDo?.(task);
  };

  return (
    <div className="aa-wn-card">
      {context && <div className="aa-wn-card__context">{context}</div>}

      <h2 className="aa-wn-card__title">{task.title}</h2>

      {(task.project || task.due || task.size || (task.imageCount ?? 0) > 0) && (
        <div className="aa-wn-card__meta">
          {task.project && <span className="aa-wn-card__meta-item">{task.project}</span>}
          {task.project && task.due && <span className="aa-wn-card__sep" aria-hidden="true">·</span>}
          {task.due && <span className="aa-wn-card__meta-item">{task.due}</span>}
          {task.due && task.size && <span className="aa-wn-card__sep" aria-hidden="true">·</span>}
          {task.size && <span className="aa-wn-card__meta-item">{task.size}</span>}
          {(task.due || task.size) && (task.imageCount ?? 0) > 0 && (
            <span className="aa-wn-card__sep" aria-hidden="true">·</span>
          )}
          {(task.imageCount ?? 0) > 0 && (
            <span className="aa-wn-card__meta-item">
              {task.imageCount === 1 ? "1 image" : `${task.imageCount} images`}
            </span>
          )}
        </div>
      )}

      {(task.why || task.whyEmphasis) && (
        <p className="aa-wn-card__why">
          {task.why}
          {task.why && task.whyEmphasis && " "}
          {task.whyEmphasis && <strong>{task.whyEmphasis}</strong>}
        </p>
      )}

      {/* Goal rationale + paused-work continuity (focus-goal-context spec).
          Shown ONLY in the `next` candidate state — the home `now` state keeps
          live execution context in Focus, not on the chooser card. Both blocks
          are passive: no card, icon, link, disclosure, editor, or focus target. */}
      {state === "next" && (task.goalContext || task.continuityStats) && (
        <section className="aa-wn-card__purpose" aria-label="Goal and previous work">
          {task.goalContext && (
            <div className="aa-wn-card__goal" aria-label="Goal context">
              <p className="aa-wn-card__goal-question">Why does this matter?</p>
              <p className="aa-wn-card__goal-answer">
                {task.goalContext.description ??
                  `Toward ${task.goalContext.name}.`}
              </p>
              {task.goalContext.description && (
                <p className="aa-wn-card__goal-attribution">
                  Goal · {task.goalContext.name}
                </p>
              )}
            </div>
          )}

          {task.continuityStats && (
            <div className="aa-wn-card__continuity" aria-label="Previous work">
              <p className="aa-wn-card__continuity-stats">{task.continuityStats}</p>
              {task.latestNote && (
                <p className="aa-wn-card__latest-note">
                  <span className="aa-wn-card__latest-note-label">Latest note</span>
                  <span className="aa-wn-card__latest-note-body">{task.latestNote}</span>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      <div className="aa-wn-card__actions">
        {/* One primary button: "Start". Starts the task if it isn't already,
            then opens focus mode. Previously this swapped between "Start"
            (onStart) and "Do this" (onDo) based on state — but onStart always
            opened focus too, so the two were the same action with different
            labels, creating a dead extra click (Start → Do this → focus). Now
            it's always Start → focus. The `doing` flag gives a brief "Done ✓"
            flash on tap (visual feedback before the navigate lands). */}
        <Button variant="primary" onClick={handleDo} disabled={doing}>
          {doing ? "Done ✓" : "Start"}
        </Button>
        {/* Secondary: Pause when in progress (drops back to Next), Not now
            when it's a fresh candidate (opens the snooze sheet). */}
        {state === "now" ? (
          <Button variant="secondary" onClick={() => onPause?.(task)} disabled={doing}>
            Pause
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => onNotNow?.(task)} disabled={doing}>
            Not now
          </Button>
        )}
      </div>
    </div>
  );
}
