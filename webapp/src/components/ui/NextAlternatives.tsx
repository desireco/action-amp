import "./NextAlternatives.css";

export interface NextAlternative {
  /** Task id — used as the React key and to exclude the on-stage task */
  id: string;
  /** Permalink — choosing a row routes to /do/today/:permalink */
  permalink: string;
  /** The thing to do */
  title: string;
  /** Project this task belongs to */
  project?: string;
  /** Human due label (e.g. "due today", "due Friday") */
  due?: string;
  /** Size label (e.g. "15 min", "XL") */
  size?: string;
  /** True when this row is the focus engine's current #1 — the
   * recommendation that yielded the stage to a picked task. Renders the
   * "Suggested" kicker so the matcher's voice survives below the fold. */
  suggested?: boolean;
}

interface NextAlternativesProps {
  /** Active lens name — "Or choose another task in Work" */
  lensName: string;
  /** Ranked alternatives, already excluding the on-stage task. Empty → hidden. */
  tasks: NextAlternative[];
  /** Fired with the chosen row; the page navigates, nothing mutates. */
  onChoose: (task: NextAlternative) => void;
}

/**
 * NextAlternatives — "Or choose another task in <Lens>", below the NextCard.
 *
 * The chooser half of What Now: when the recommended next task isn't a match,
 * the next ranked candidates wait one hairline down. Choosing one is pure
 * navigation (the existing picked-task path, /do/today/:permalink) — the
 * card above swaps to the pick, the recommendation re-enters the list, and
 * nothing is snoozed, started, or demoted. Rendered only while deciding
 * (the `next` candidate state); a started task keeps the stage to itself.
 *
 * From the next-task-alternatives prototype (mockup), restyled to tokens.
 */
export function NextAlternatives({ lensName, tasks, onChoose }: NextAlternativesProps) {
  if (tasks.length === 0) return null;

  return (
    <section className="aa-wn-alts" aria-label="Alternative tasks">
      <div className="aa-wn-alts__heading">
        <h2 className="aa-wn-alts__title">Or choose another task in {lensName}</h2>
        <p className="aa-wn-alts__hint">The recommendation stays available.</p>
      </div>
      <ul className="aa-wn-alts__list">
        {tasks.map((task) => {
          const meta = [task.project, task.due, task.size].filter(Boolean).join(" · ");
          return (
            <li key={task.id}>
              <button
                className="aa-wn-alts__row"
                type="button"
                onClick={() => onChoose(task)}
              >
                <span className="aa-wn-alts__row-main">
                  {task.suggested && (
                    <span className="aa-wn-alts__kicker">Suggested</span>
                  )}
                  <span className="aa-wn-alts__row-title">{task.title}</span>
                  {meta && <span className="aa-wn-alts__row-meta">{meta}</span>}
                </span>
                <span className="aa-wn-alts__row-action" aria-hidden="true">
                  Choose instead
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
