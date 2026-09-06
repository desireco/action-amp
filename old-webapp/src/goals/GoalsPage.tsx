import { useState } from "react";
import { useQuery, getGoals, createGoal, getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveLens } from "../app/lensContext";
import {
  RecordCardGrid,
  RecordComposer,
  GoalsIcon,
  ProgressCard,
  ProGate,
  RecordCreateControl,
  AllowanceChip,
} from "../components/ui";
import { ListEmpty } from "../lists/ListShell";
import { FREE_LIMITS } from "../billing/config";
import { useEntitled, extractEntitlementMessage } from "../billing/useEntitled";
import type { EntitlementMessage } from "../billing/entitlement-types";
import "./GoalListView.css";

interface GoalRow {
  id: string;
  permalink: string;
  name: string;
  description: string | null;
  projectCount: number;
  progress: number;
  // First non-done project in sequence order (goal-planning spec §E). Null
  // when the goal has no projects or all are done — the card hides the line.
  nextProject: { id: string; permalink: string; name: string } | null;
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

  const handleCreate = async (name: string, description?: string) => {
    if (!lens) return;
    setSubmitting(true);
    setGate(null);
    try {
      await createGoal({ name, lensId: lens.id, description });
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

  if (!isLoading && (goals?.length ?? 0) === 0 && !creating) {
    return (
      <div className="aa-goals">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Planning</div>
            <h1 className="aa-list-header__title">Goals</h1>
            <p className="aa-list-header__description">
              0 active · Outcomes your projects move forward.
            </p>
          </div>
          <RecordCreateControl
            label="New goal"
            icon={GoalsIcon}
            upgradeFeature="New goal"
            upgradeReason="link work to more than one outcome"
            creating={creating}
            atCap={atCap}
            empty
            onToggleCreating={setCreating}
          />
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
          <div className="aa-list-header__eyebrow">Planning</div>
          <h1 className="aa-list-header__title">Goals</h1>
          <p className="aa-list-header__description">
            {isLoading ? "Loading active goals…" : `${goals?.length ?? 0} active · Outcomes your projects move forward.`}
          </p>
          <div className="aa-list-header__meta">
            <AllowanceChip
              entitled={entitled}
              atCap={atCap}
              used={goalCount}
              cap={FREE_LIMITS.goals}
            />
          </div>
        </div>
        <RecordCreateControl
          label="New goal"
          icon={GoalsIcon}
          upgradeFeature="New goal"
          upgradeReason="link work to more than one outcome"
          creating={creating}
          atCap={atCap}
          empty={false}
          onToggleCreating={setCreating}
        />
      </header>
      {gate && <ProGate feature={gate.feature} reason={gate.reason} />}
      {creating && (
        <RecordComposer
          title="New goal"
          subtitle="Name the outcome. Add the why if it helps."
          nameLabel="Outcome"
          namePlaceholder="Grow audience"
          descriptionLabel="Why this matters"
          descriptionPlaceholder="So launches do not depend on one-off posts"
          submitLabel="Create goal"
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
          submitting={submitting}
        />
      )}
      <RecordCardGrid>
        {(goals ?? []).map((g: GoalRow) => (
          <ProgressCard
            key={g.id}
            to={`/do/goals/${g.permalink}`}
            title={g.name}
            description={g.description}
            progress={g.progress}
            meta={
              <>
                <span>{g.projectCount} project{g.projectCount === 1 ? "" : "s"}</span>
              </>
            }
            focusLabel={g.nextProject ? "Focus" : undefined}
            focusValue={g.nextProject?.name}
          />
        ))}
      </RecordCardGrid>
    </div>
  );
}
