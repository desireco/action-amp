import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getGoals, createGoal, getAppData } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveLens } from "../app/lensContext";
import { Button, Chip, GoalsIcon, PlusIcon, ProGate } from "../components/ui";
import { ListEmpty } from "../lists/ListShell";
import { FREE_LIMITS } from "../billing/config";
import { useEntitled, extractEntitlementMessage } from "../billing/useEntitled";
import type { EntitlementMessage } from "../billing/entitlement-types";
import "./GoalsPage.css";

interface GoalRow {
  id: string;
  name: string;
  description: string | null;
  projectCount: number;
  taskCount: number;
  progress: number;
  // First non-done project in sequence order (goal-planning spec §E). Null
  // when the goal has no projects or all are done — the card hides the line.
  nextProject: { id: string; name: string } | null;
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

  // Create affordance: button, or ProGate trigger when a FREE user is at cap.
  const CreateControl = ({ empty }: { empty: boolean }) =>
    creating ? null : atCap ? (
      <ProGate asTrigger feature="New goal" reason="link work to more than one outcome with Pro">
        <span className="aa-progate-trigger__label">New goal</span>
        <span className="aa-progate-trigger__cta">Upgrade →</span>
      </ProGate>
    ) : (
      <Button
        variant="secondary"
        className="aa-goals-new"
        icon={<GoalCreateMark />}
        onClick={() => (empty ? setCreating(true) : setCreating((v) => !v))}
      >
        New goal
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
        <GoalComposer
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
          submitting={submitting}
        />
      )}
      <div className="aa-goals-grid aa-goals-grid--with-create">
        {(goals ?? []).map((g: GoalRow) => (
          <Link key={g.id} to={`/app/goals/${g.id}`} className="aa-goal-card">
            <span className="aa-goal-card__name">{g.name}</span>
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
            {g.nextProject && (
              <p className="aa-goal-card__next">
                Focus: <span>{g.nextProject.name}</span>
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function GoalCreateMark() {
  return (
    <span className="aa-goals-new__mark" aria-hidden="true">
      <GoalsIcon className="aa-goals-new__goal" />
      <PlusIcon className="aa-goals-new__plus" />
    </span>
  );
}

function GoalComposer({
  onCreate,
  onCancel,
  submitting,
}: {
  onCreate: (name: string, description?: string) => Promise<void> | void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const canSubmit = !!name.trim() && !submitting;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || submitting) return;

    const trimmedDescription = description.trim();
    await onCreate(trimmedName, trimmedDescription || undefined);
    setName("");
    setDescription("");
  };

  const submitFromTextarea = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} className="aa-goal-composer" onSubmit={submit}>
      <div className="aa-goal-composer__head">
        <div>
          <h2 className="aa-goal-composer__title">New goal</h2>
          <p className="aa-goal-composer__sub">Name the outcome. Add the why if it helps.</p>
        </div>
      </div>

      <label className="aa-goal-composer__field">
        <span className="aa-goal-composer__label">Outcome</span>
        <input
          className="aa-goal-composer__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Grow audience"
          autoFocus
        />
      </label>

      <label className="aa-goal-composer__field">
        <span className="aa-goal-composer__label">Why this matters</span>
        <textarea
          className="aa-goal-composer__textarea"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={submitFromTextarea}
          placeholder="So launches do not depend on one-off posts"
          rows={3}
        />
      </label>

      <div className="aa-goal-composer__actions">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Create goal
        </Button>
      </div>
    </form>
  );
}
