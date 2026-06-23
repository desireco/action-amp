import { useState } from "react";
import { useQuery } from "wasp/client/operations";
import { getTopTask, toggleTaskDone, snoozeTask, startTask, pauseTask } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { WhatNowCard, FocusMode, SnoozeSheet, type FocusTask, type SnoozePreset } from "../components/ui";
import { useActiveLens } from "./lensContext";
import "./WhatNowPage.css";

/**
 * The home screen — "What Now". The product's wedge: not a list, a chooser.
 *
 * Renders the focus engine's top task (priority-first MVP, FEATURES.md F10),
 * or a calm empty state when nothing's on the table. Scoped to the active Lens.
 */
export function WhatNowPage() {
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
      // leaves What Now and the nav counts update.
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

  const metaParts = [
    topTask.project?.name,
    topTask.status === "TODAY" ? "due today" : null,
    sizeLabel(topTask.size),
  ].filter(Boolean) as string[];

  return (
    <>
      <WhatNowCard
        task={{
          title: topTask.description,
          project: topTask.project?.name,
          due: "due today",
          size: sizeLabel(topTask.size),
          why: "Because it's",
          whyEmphasis: `${priorityLabel(topTask.priority)}${topTask.status === "TODAY" ? " and due today" : ""}.`,
        }}
        context={`${isNow ? "Now" : "Next"} · ${lens.name}`}
        state={isNow ? "now" : "next"}
        onComplete={handleComplete}
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

function priorityLabel(priority: string): string {
  return priority === "IMPORTANT" ? "Important" : priority === "LOW" ? "Low" : "Normal";
}
