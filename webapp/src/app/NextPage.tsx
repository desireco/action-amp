import { useState } from "react";
import { useQuery } from "wasp/client/operations";
import { getTopTask, toggleTaskDone, snoozeTask, startTask, pauseTask } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { NextCard, FocusMode, SnoozeSheet, type FocusTask, type SnoozePreset } from "../components/ui";
import { useActiveLens } from "./lensContext";
import { composeWhy } from "./focusWhy";
import "./NextPage.css";

/**
 * The home screen — "Next". The product's wedge: not a list, a chooser.
 *
 * Renders the focus engine's top task (priority-first MVP, FEATURES.md F10),
 * or a calm empty state when nothing's on the table. Scoped to the active Lens.
 */
export function NextPage() {
  const lens = useActiveLens();
  const queryClient = useQueryClient();
  const { data: topTask, isLoading } = useQuery(
    getTopTask,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );
  const [focusTask, setFocusTask] = useState<FocusTask | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);

  const handleComplete = async () => {
    if (!topTask) return;
    try {
      await toggleTaskDone({ id: topTask.id });
      // Refresh the focus candidates + dependent lists so the completed task
      // leaves Next and the nav counts update.
      queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
      queryClient.invalidateQueries({ queryKey: ["getTasks"] });
      queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
    } catch {
      // reverts via refetch
    }
  };

  const handleSnooze = async (preset: SnoozePreset) => {
    if (!topTask) return;
    await snoozeTask({ id: topTask.id, preset });
    // Snoozed task leaves Today → refresh focus + Upcoming/Someday + counts.
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  // Start / Pause the "Now" state. Started tasks persist as #1 across nav.
  const isNow = !!topTask?.startedAt;
  const handleStart = async () => {
    if (!topTask) return;
    await startTask({ id: topTask.id });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
  };
  const handlePause = async () => {
    if (!topTask) return;
    await pauseTask({ id: topTask.id });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
  };

  // ---- Empty / loading states ----
  if (!lens || isLoading) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">What now</div>
        <h1 className="aa-wn-empty">…</h1>
      </div>
    );
  }

  if (!topTask) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">What now</div>
        <h1 className="aa-wn-empty">Nothing on the table.</h1>
        <p className="aa-wn-empty-sub">
          You're all caught up. Capture something with{" "}
          <span className="aa-wn-kbd">⌘K</span>, then triage it to Today to put it on the table.
        </p>
      </div>
    );
  }

  const dueLabel =
    topTask.status === "TODAY"
      ? "due today"
      : topTask.dueDate
        ? `due ${formatWhen(topTask.dueDate)}`
        : null;
  const metaParts = [topTask.project?.name, dueLabel, sizeLabel(topTask.size)].filter(
    Boolean,
  ) as string[];

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
  const why = composeWhy(topTask);
  const whyLead = why.lead || why.detail;
  const whyDetail = why.lead ? why.detail : "";

  return (
    <>
      <NextCard
        task={{
          title: topTask.description,
          project: topTask.project?.name,
          due: dueLabel ?? undefined,
          size: sizeLabel(topTask.size),
          why: whyLead || undefined,
          whyEmphasis: whyDetail || undefined,
        }}
        context={
          <>
            {isNow ? "Now" : "Next"} ·{" "}
            <span className="aa-wn-card__context-lens">{lens.name}</span>
          </>
        }
        state={isNow ? "now" : "next"}
        onStart={handleStart}
        onPause={handlePause}
        onDo={() => {
          // "Do this" starts the task (Now) AND enters focus mode.
          if (!isNow) void handleStart();
          setFocusTask({
            id: topTask.id,
            title: topTask.description,
            project: topTask.project?.name ?? null,
            due: metaParts.find((p) => p.includes("due")) ?? null,
            size: sizeLabel(topTask.size),
            content: topTask.content ?? null,
          });
        }}
        onNotNow={() => setSnoozeOpen(true)}
      />
      {snoozeOpen && topTask && (
        <SnoozeSheet
          taskTitle={topTask.description}
          onSnooze={handleSnooze}
          onClose={() => setSnoozeOpen(false)}
        />
      )}
      {focusTask && (
        <FocusMode
          task={focusTask}
          onClose={() => setFocusTask(null)}
          onComplete={() => {
            setFocusTask(null);
            handleComplete();
          }}
        />
      )}
    </>
  );
}

function sizeLabel(size: string | null | undefined): string {
  if (!size) return "";
  return { S: "15 min", M: "30 min", L: "1 hr", XL: "2 hr+" }[size] ?? size;
}

// Relative day label for a due date: "today", "tomorrow", "Fri", or "Jun 30".
// The "why" line and meta use this so an Upcoming task reads truthfully (not a
// hardcoded "due today" when it has no date at all).
function formatWhen(date: Date): string {
  const d = new Date(date);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
