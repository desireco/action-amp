import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getGoals, createGoal, getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveLens } from "../app/lensContext";
import { Button, Chip, ProGate } from "../components/ui";
import { ListEmpty } from "../lists/ListShell";
import { CreateInline } from "../lists/CreateInline";
import { FREE_LIMITS } from "../billing/config";
import { useEntitled, extractEntitlementMessage } from "../billing/useEntitled";
import type { EntitlementMessage } from "../billing/entitlement-types";
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
  const [gate, setGate] = useState<EntitlementMessage | null>(null);
  const { data: goals, isLoading } = useQuery(
    getGoals,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  // Entitlement: FREE users capped at FREE_LIMITS.goals per lens. Count from
  // getAppData (lens-scoped, non-done) — deduped with the shell's fetch. PRO
  // users see no cap UI.
  const entitled = useEntitled();
  const { data: appData } = useQuery(
    getAppData,
    { lensId: lens?.id ?? null },
    { enabled: !!lens },
  );
  const goalCount = appData?.counts.goals ?? 0;
  const atCap = !entitled && goalCount >= FREE_LIMITS.goals;

  const handleCreate = async (name: string) => {
    if (!lens) return;
    setSubmitting(true);
    setGate(null);
    try {
      await createGoal({ name, lensId: lens.id });
      queryClient.invalidateQueries({ queryKey: ["getGoals"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } catch (err) {
      // Entitlement: a 402 from the cap guard → paywall moment, not raw error.
      setGate(extractEntitlementMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Create affordance: button, or ProGate trigger when a FREE user is at cap.
  const CreateControl = ({ empty }: { empty: boolean }) =>
    atCap ? (
      <ProGate asTrigger feature="New goal" reason="link work to more than one outcome with Pro">
        <span className="aa-progate-trigger__label">New goal</span>
        <span className="aa-progate-trigger__cta">Upgrade →</span>
      </ProGate>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => (empty ? setCreating(true) : setCreating((v) => !v))}>
        {creating ? "Cancel" : "New goal"}
      </Button>
    );

  const AllowanceChip = () =>
    !entitled && !atCap ? (
      <Chip variant="muted" small>
        {goalCount} of {FREE_LIMITS.goals} used
      </Chip>
    ) : null;

  if (!isLoading && (goals?.length ?? 0) === 0 && !creating) {
    return (
      <div className="aa-goals">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Goals</div>
            <h1 className="aa-list-header__title">0 active</h1>
          </div>
          <CreateControl empty />
        </header>
        {gate && <ProGate feature={gate.feature} reason={gate.reason} />}
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
          <div className="aa-list-header__meta">
            <AllowanceChip />
          </div>
        </div>
        <CreateControl empty={false} />
      </header>
      {gate && <ProGate feature={gate.feature} reason={gate.reason} />}
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
            <Link to={`/app/goals/${g.id}`} className="aa-goal-card__name">{g.name}</Link>
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
