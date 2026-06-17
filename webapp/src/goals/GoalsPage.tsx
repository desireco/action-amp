import { useQuery } from "wasp/client/operations";
import { getGoals } from "wasp/client/operations";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import "./GoalsPage.css";

interface GoalRow {
  id: string;
  name: string;
  description: string | null;
  projectCount: number;
  taskCount: number;
  progress: number;
}

/**
 * Goals — the organizing layer. Each goal rolls up its projects + standalone
 * tasks into an aggregate progress %. Grouped flat (no sub-grouping).
 */
export function GoalsPage() {
  const lens = useActiveLens();
  const { data: goals, isLoading } = useQuery(
    getGoals,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  if (!isLoading && (goals?.length ?? 0) === 0) {
    return (
      <ListEmpty
        title="No goals yet."
        text="Goals are active outcomes — what your projects and tasks roll up to. Link a project or task to a goal during triage."
      />
    );
  }

  return (
    <div className="aa-goals">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Goals</div>
          <h1 className="aa-list-header__title">{goals?.length ?? 0} active</h1>
        </div>
      </header>
      <div className="aa-goals-grid">
        {(goals ?? []).map((g: GoalRow) => (
          <div key={g.id} className="aa-goal-card">
            <h3 className="aa-goal-card__name">{g.name}</h3>
            {g.description && <p className="aa-goal-card__desc">{g.description}</p>}
            <div className="aa-goal-card__progress">
              <div className="aa-goal-card__bar">
                <div className="aa-goal-card__fill" style={{ width: `${g.progress}%` }} />
              </div>
              <span className="aa-goal-card__pct">{g.progress}%</span>
            </div>
            <div className="aa-goal-card__meta">
              <span>{g.projectCount} project{g.projectCount === 1 ? "" : "s"}</span>
              <span className="aa-goal-card__dot" aria-hidden="true">·</span>
              <span>{g.taskCount} task{g.taskCount === 1 ? "" : "s"}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
