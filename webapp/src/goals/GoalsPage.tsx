import { useState } from "react";
import { useQuery } from "wasp/client/operations";
import { getGoals, createGoal } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveLens } from "../app/lensContext";
import { Button } from "../components/ui";
import { ListEmpty } from "../lists/ListShell";
import { CreateInline } from "../lists/CreateInline";
import "./GoalsPage.css";
import "../lists/CreateInline.css";

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
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: goals, isLoading } = useQuery(
    getGoals,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  const handleCreate = async (name: string) => {
    if (!lens) return;
    setSubmitting(true);
    try {
      await createGoal({ name, lensId: lens.id });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } catch {
      /* surface elsewhere */
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLoading && (goals?.length ?? 0) === 0 && !creating) {
    return (
      <div className="aa-goals">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Goals</div>
            <h1 className="aa-list-header__title">0 active</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>New goal</Button>
        </header>
        <ListEmpty
          title="No goals yet."
          text="Goals are active outcomes — what your projects and tasks roll up to. Create one, or link a project/task to a goal during triage."
        />
      </div>
    );
  }

  return (
    <div className="aa-goals">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Goals</div>
          <h1 className="aa-list-header__title">{goals?.length ?? 0} active</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New goal"}
        </Button>
      </header>
      {creating && (
        <CreateInline
          placeholder="Goal name (e.g. ‘Grow audience’)"
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
          submitting={submitting}
        />
      )}
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
