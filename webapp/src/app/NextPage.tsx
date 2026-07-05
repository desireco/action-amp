import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getTopTask,
  getTask,
  snoozeTask,
  startTask,
  pauseTask,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { NextCard, SnoozeSheet, type SnoozePreset } from "../components/ui";
import { useActiveLens } from "./lensContext";
import { composeWhy } from "./focusWhy";
import { formatWhen, sizeLabel } from "./focusTaskView";
import "./NextPage.css";

/**
 * The home screen — "Next". The product's wedge: not a list, a chooser.
 *
 * Renders the focus engine's top task (priority-first MVP, FEATURES.md F10),
 * or a calm empty state when nothing's on the table. Scoped to the active Lens.
 */
export function NextPage() {
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

  useEffect(() => {
    if (!permalink && queryTaskToken) {
      navigate(`/app/today/${encodeURIComponent(queryTaskToken)}`, {
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
    if (selectedTaskToken) navigate("/app/today", { replace: true });
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
    if (openFocus) navigate("/app/focus");
  };
  const handlePause = async () => {
    if (!task) return;
    await pauseTask({ id: task.id });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
  };

  // ---- Empty / loading states ----
  if (!lens || isLoading || (selectedTaskToken && isSelectedTaskLoading)) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">What now</div>
        <h1 className="aa-wn-empty">…</h1>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="aa-wn">
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
              <span className="aa-wn-kbd">⌘K</span>, then triage it to Today to
              put it on the table.
            </>
          )}
        </p>
      </div>
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

  return (
    <>
      <NextCard
        task={{
          title: task.description,
          project: task.project?.name,
          due: dueLabel ?? undefined,
          size: sizeLabel(task.size),
          why: whyLead || undefined,
          whyEmphasis: whyDetail || undefined,
        }}
        context={
          <>
            {isNow ? "Now" : selectedTaskToken ? "Picked" : "Next"} ·{" "}
            <span className="aa-wn-card__context-lens">{lens.name}</span>
          </>
        }
        state={isNow ? "now" : "next"}
        onStart={() => void handleStart(true)}
        onPause={handlePause}
        onDo={() => {
          if (isNow) {
            navigate("/app/focus");
            return;
          }
          void handleStart(true);
        }}
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
