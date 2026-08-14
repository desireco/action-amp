import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import { useAuth } from "wasp/client/auth";
import {
  getTopTask,
  getTask,
  snoozeTask,
  startTask,
  pauseTask,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { NextCard, SnoozeSheet, SplashScreen, type SnoozePreset } from "../components/ui";
import { useActiveLens } from "./lensContext";
import { composeWhy } from "./focusWhy";
import {
  resolveGoal,
  resolveContinuity,
  continuityStatsRow,
  type TaskContextInput,
} from "./taskContext";
import { formatWhen, sizeLabel } from "./focusTaskView";
import "./NextPage.css";

/**
 * The home screen — "Next". The product's wedge: not a list, a chooser.
 *
 * Renders the focus engine's top task (priority-first MVP, FEATURES.md F10),
 * or a calm empty state when nothing's on the table. Scoped to the active Lens.
 */
export function NextPage() {
  const { data: user } = useAuth();
  const lens = useActiveLens();
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
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    if (openFocus) navigate("/do/focus");
  };
  const handlePause = async () => {
    if (!task) return;
    await pauseTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
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
        </div>
      </>
    );
  }

  const dueLabel =
    task.status === "TODAY"
      ? "due today"
      : task.dueDate
        ? `due ${formatWhen(task.dueDate)}`
        : null;

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
  const goalContext = !isNow
    ? resolveGoal(task as TaskContextInput)
    : null;
  const continuity = !isNow
    ? resolveContinuity(task as TaskContextInput)
    : null;
  const continuityStats = continuity ? continuityStatsRow(continuity) : null;

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
