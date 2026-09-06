import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useAuth } from "wasp/client/auth";
import {
  useQuery,
  getTopTask,
  getTaskAlternatives,
  getOtherLensTaskCounts,
  getTask,
  snoozeTask,
  startTask,
  pauseTask,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import {
  NextAlternatives,
  NextCard,
  SnoozeSheet,
  SplashScreen,
  type SnoozePreset,
} from "../components/ui";
import { useActiveLens, useLensSwitch } from "./lensContext";
import { composeWhy } from "./focusWhy";
import {
  resolveGoal,
  resolveContinuity,
  continuityStatsRow,
  type TaskContextInput,
} from "./taskContext";
import { formatWhen, sizeLabel } from "./focusTaskView";
import "./NextPage.css";

/** Light candidate row from getTaskAlternatives — full Task fields for
 * display, but no history relations (those hydrate only on the winner). */
type AlternativeCandidate = {
  id: string;
  permalink: string;
  description: string;
  status: string;
  scheduledDate: Date | string | null;
  size: string;
  project?: { name: string } | null;
};

/**
 * The home screen — "Next". The product's wedge: not a list, a chooser.
 *
 * Renders the focus engine's top task (priority-first MVP, FEATURES.md F10),
 * or a calm empty state when nothing's on the table. Scoped to the active Lens.
 * While deciding (not started), the alternatives rail below the card offers
 * the next ranked candidates — picking one routes through the picked-task
 * path (/do/today/:permalink); nothing is mutated, the recommendation stays
 * available in the list.
 */
export function NextPage() {
  const { data: user } = useAuth();
  const lens = useActiveLens();
  const switchLens = useLensSwitch();
  const navigate = useNavigate();
  const { permalink } = useParams<{ permalink: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const queryTaskToken = searchParams.get("task");
  const selectedTaskToken = permalink ?? queryTaskToken;
  const { data: topTask, isLoading } = useQuery(
    getTopTask,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );
  const { data: selectedTask, isLoading: isSelectedTaskLoading } = useQuery(
    getTask,
    selectedTaskToken ? { id: selectedTaskToken } : undefined,
    { enabled: !!selectedTaskToken },
  );
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const task = selectedTaskToken ? selectedTask : topTask;
  // Alternatives: the same ranked pool minus whatever is on stage. Only
  // fetched while deciding — a started task (Now) keeps the stage to itself.
  const { data: alternatives } = useQuery(
    getTaskAlternatives,
    lens
      ? {
          lensId: lens.id,
          excludeIds: task?.id ? [task.id] : undefined,
        }
      : undefined,
    { enabled: !!lens && !task?.startedAt },
  );
  // "Nothing on the table" is only true for THIS lens. Fetched only in the
  // empty state (no picked task, nothing on the table): one count per other
  // accessible lens, from the same actionable pool the card ranks from.
  // Empty (or loading) → no hints — whitespace, not zeroes.
  const { data: otherLensCounts } = useQuery(
    getOtherLensTaskCounts,
    lens ? { excludeLensId: lens.id } : undefined,
    { enabled: !!lens && !selectedTaskToken && !task },
  );

  // Splash latch: the welcome veil (see the render section) covers only the
  // *first* data load. `entered` latches once content has rendered, so later
  // loads (lens switch, refetch after actions) fall back to the placeholder
  // instead of replaying the welcome.
  const [entered, setEntered] = useState(false);
  const appLoading = Boolean(
    !lens || isLoading || (selectedTaskToken && isSelectedTaskLoading),
  );
  useEffect(() => {
    if (!appLoading) setEntered(true);
  }, [appLoading]);

  useEffect(() => {
    if (!permalink && queryTaskToken) {
      navigate(`/do/today/${encodeURIComponent(queryTaskToken)}`, {
        replace: true,
      });
    }
  }, [navigate, permalink, queryTaskToken]);

  const handleSnooze = async (preset: SnoozePreset) => {
    if (!task) return;
    await snoozeTask({ id: task.id, preset });
    // Snoozed task leaves Today → refresh focus + Upcoming/Someday + counts.
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTaskAlternatives"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    if (selectedTaskToken) navigate("/do/today", { replace: true });
  };

  // Start / Pause the "Now" state. Started tasks persist as #1 across nav.
  const isNow = !!task?.startedAt;
  const handleStart = async (openFocus = true) => {
    if (!task) return;
    await startTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTaskAlternatives"] });
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    if (openFocus) navigate("/do/focus");
  };
  const handlePause = async () => {
    if (!task) return;
    await pauseTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTaskAlternatives"] });
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
  };

  // ---- Empty / loading states ----
  // The welcome veil covers the first data load, then self-fades over the
  // content beneath. It stays mounted through that fade, so it rides along
  // every content branch below (splashVeil is null once it has exited).
  const splashVeil = <SplashScreen active={!entered && appLoading} />;

  if (appLoading) {
    return entered ? (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">What now</div>
        <h1 className="aa-wn-empty">…</h1>
      </div>
    ) : (
      splashVeil
    );
  }

  // Unreachable once appLoading is false (it includes !lens) — restores the
  // type narrowing the extracted appLoading const lost.
  if (!lens) return null;

  if (!selectedTaskToken && user?.onboardingStage === "CAPTURE") {
    return (
      <>
        {splashVeil}
        <OnboardingGuide stage="CAPTURE" />
      </>
    );
  }

  if (!selectedTaskToken && user?.onboardingStage === "TRIAGE") {
    return (
      <>
        {splashVeil}
        <OnboardingGuide stage="TRIAGE" />
      </>
    );
  }

  if (!task) {
    return (
      <>
        {splashVeil}
        <div className="aa-wn">
          <Link to="/do/today" className="aa-wn-today-link">
            See Today →
          </Link>
          <div className="aa-wn-eyebrow">What now</div>
          <h1 className="aa-wn-empty">
            {selectedTaskToken
              ? "That task isn't available."
              : "Nothing on the table."}
          </h1>
          <p className="aa-wn-empty-sub">
            {selectedTaskToken ? (
              <>
                It may have moved or been completed. Go back to Today, or clear
                the selected task.
              </>
            ) : (
              <>
                You're all caught up. Capture something with{" "}
                <span className="aa-wn-kbd">⌘K</span>, then triage it to Today
                to put it on the table.
              </>
            )}
          </p>
          {!selectedTaskToken && otherLensCounts && otherLensCounts.length > 0 && (
            <div className="aa-wn-lens-hints">
              {otherLensCounts.map((hint) =>
                switchLens ? (
                  <button
                    key={hint.lensId}
                    type="button"
                    className="aa-wn-lens-hint"
                    onClick={() => switchLens(hint.lensId)}
                  >
                    {hint.lensName} · {hint.count} on the table →
                  </button>
                ) : (
                  <span key={hint.lensId} className="aa-wn-lens-hint">
                    {hint.lensName} · {hint.count} on the table
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  const dueLabelFor = (t: { status: string; scheduledDate: Date | string | null }) =>
    t.status === "TODAY"
      ? "due today"
      : t.scheduledDate
        ? `due ${formatWhen(t.scheduledDate)}`
        : null;
  const dueLabel = dueLabelFor(task);

  // The honest "why this?" — composed from the same fields getTopTask ranked on
  // (startedAt → priority → due → size). Empty when there's nothing truthful
  // to add (e.g. a Normal task with no due date); in that case the why line is
  // omitted entirely rather than stating a fake reason. See focusWhy.ts.
  //
  // The lead → why (plain), detail → whyEmphasis (bold amber) split only holds
  // when there IS a lead. For a lead-less NORMAL reason (e.g. "Overdue"), the
  // detail carries the whole reason and should render as plain text — so we
  // promote it to `why`. This keeps the visual weight correct: amber emphasis
  // marks an *appended* clause, not a standalone reason.
  const why = composeWhy(task);
  const whyLead = why.lead || why.detail;
  const whyDetail = why.lead ? why.detail : "";

  // Goal rationale + paused-work continuity (focus-goal-context spec). Both are
  // derived from the owned, hydrated winner (getTopTask now carries
  // project.goal / goal.description / sessions / NOTE updates). Resolvers
  // degrade gracefully: a picked Task (getTask path) lacks those relations, so
  // resolveGoal returns null and continuity has no history — nothing renders,
  // which is the spec's "missing data creates whitespace, not nags."
  //
  // Both blocks are passed ONLY for the `next` candidate state. The home `now`
  // state keeps live execution context in Focus; a stale summary has no place
  // on the chooser while work is active.
  // SAFETY: task is the full TaskContextInput shape when isNow is false.
  const goalContext = !isNow ? resolveGoal(task as TaskContextInput) : null;
  // SAFETY: task is the full TaskContextInput shape when isNow is false.
  const continuity = !isNow ? resolveContinuity(task as TaskContextInput) : null;
  const continuityStats = continuity ? continuityStatsRow(continuity) : null;

  // Alternative rows — the ranked pool minus the on-stage task. `suggested`
  // marks the engine's #1, which only appears here while a *picked* task is
  // on stage (the recommendation itself is excluded while it holds the card).
  const alternativeRows = (alternatives ?? [])
    .filter((t: { id: string }) => t.id !== task.id)
    .map((t: AlternativeCandidate) => ({
      id: t.id,
      permalink: t.permalink,
      title: t.description,
      project: t.project?.name,
      due: dueLabelFor(t) ?? undefined,
      size: sizeLabel(t.size),
      suggested: t.id === topTask?.id,
    }));

  return (
    <>
      {splashVeil}
      <Link to="/do/today" className="aa-wn-today-link">
        See Today →
      </Link>
      <NextCard
        task={{
          title: task.description,
          project: task.project?.name,
          due: dueLabel ?? undefined,
          size: sizeLabel(task.size),
          why: whyLead || undefined,
          whyEmphasis: whyDetail || undefined,
          goalContext,
          continuityStats,
          latestNote: !isNow ? continuity?.latestNote ?? null : null,
          attachments: task.attachments,
        }}
        context={
          <>
            {isNow ? "Now" : selectedTaskToken ? "Picked" : "Next"} in{" "}
            <span className="aa-wn-card__context-lens">{lens.name}</span>
          </>
        }
        state={isNow ? "now" : "next"}
        onDo={() => {
          if (isNow) {
            navigate("/do/focus");
            return;
          }
          void handleStart(true);
        }}
        onPause={handlePause}
        onNotNow={() => setSnoozeOpen(true)}
      />
      {!isNow && alternativeRows.length > 0 && (
        <NextAlternatives
          lensName={lens.name}
          tasks={alternativeRows}
          onChoose={(t) =>
            navigate(`/do/today/${encodeURIComponent(t.permalink)}`)
          }
        />
      )}
      {snoozeOpen && task && (
        <SnoozeSheet
          taskTitle={task.description}
          onSnooze={handleSnooze}
          onClose={() => setSnoozeOpen(false)}
        />
      )}
    </>
  );
}

function OnboardingGuide({ stage }: { stage: "CAPTURE" | "TRIAGE" }) {
  const capture = stage === "CAPTURE";
  return (
    <section className="aa-wn aa-wn-guide" aria-labelledby="onboarding-guide-title">
      <p className="aa-wn-eyebrow">
        Try the real loop · {capture ? "capture" : "triage"}
      </p>
      <h1 id="onboarding-guide-title" className="aa-wn-empty">
        {capture ? "Capture one real thought." : "Now decide what it becomes."}
      </h1>
      <p className="aa-wn-empty-sub">
        {capture
          ? "Put down anything you want to remember. It will wait in Inbox until you decide what it becomes."
          : "Give your thought a home. ActionAmp will bring actionable work back when it matters."}
      </p>
      <Link
        className="aa-wn-guide__action"
        to={capture ? "/do?capture=1" : "/do/inbox/review"}
      >
        {capture ? "Open Capture" : "Triage your thought"} →
      </Link>
    </section>
  );
}
