import { Navigate, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import {
  getFocusedTask,
  addTaskUpdate,
  updateTaskContent,
  completeTaskFromFocus,
  completeFocusSession,
  startTask,
  pauseTask,
  snoozeTask,
} from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { FocusMode } from "../components/ui";
import type { SnoozePreset } from "../components/ui";
import { toFocusTask } from "./focusTaskView";
import "./NextPage.css";

/**
 * Dedicated focus route. Focus is a mode, not an address for a specific task:
 * the server exposes the user's single started task and this page renders it.
 */
export function FocusPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: task, isLoading, isFetching } = useQuery(getFocusedTask);

  const refreshTaskState = () => {
    queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getDoneToday"] });
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  // `getFocusedTask` can be cached as empty after completing a task. Starting
  // the next task invalidates that cache immediately before navigating here;
  // wait for its refetch before deciding there is no focus task. Otherwise the
  // stale empty result redirects back to /do, forcing a second Start tap.
  if (isLoading || isFetching) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">Focus</div>
        <h1 className="aa-wn-empty">...</h1>
      </div>
    );
  }

  if (!task) {
    return <Navigate to="/do" replace />;
  }

  return (
    <FocusMode
      task={toFocusTask(task)}
      skipCompletionReflection={task.isOnboardingSample}
      onClose={async () => {
        // Leaving focus = pausing the task. The X / Esc / "esc exit" all flow
        // through here. Without this, exiting left the session open and the
        // clock kept running server-side (startedAt stayed non-null). Pausing
        // closes the TaskSession and clears startedAt so the task drops back to
        // a Next candidate — no ghost timer.
        await pauseTask({ id: task.id });
        refreshTaskState();
        navigate("/do");
      }}
      onComplete={async (outcome) => {
        await completeTaskFromFocus(
          outcome ? { taskId: task.id, outcome } : { taskId: task.id },
        );
        refreshTaskState();
        // Completing the one sample task advances onboarding to real capture.
        await queryClient.invalidateQueries({ queryKey: ["auth/me"] });
        navigate("/do");
      }}
      onCompleteSession={async () => {
        await completeFocusSession({ id: task.id });
        await queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
      onStartSession={async () => {
        await startTask({ id: task.id });
        await queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
      onAddNote={async (body) => {
        await addTaskUpdate({ taskId: task.id, body });
        queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
      onSaveContent={async (content) => {
        await updateTaskContent({ taskId: task.id, content });
        queryClient.invalidateQueries({ queryKey: ["getFocusedTask"] });
      }}
      onSnooze={async (preset: SnoozePreset) => {
        // "Not now" from the mobile action bar. Snoozes the task out of the
        // focus queue entirely (sets status/dueDate, clears startedAt). The
        // task reappears in Upcoming/Someday when the snooze expires.
        await snoozeTask({ id: task.id, preset });
        refreshTaskState();
        navigate("/do");
      }}
    />
  );
}
