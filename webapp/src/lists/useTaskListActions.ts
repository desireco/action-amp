import { useQueryClient } from "@tanstack/react-query";
import { updateTaskContent, updateTaskStatus } from "wasp/client/operations";
import type { TaskRowTask } from "../components/ui";

/**
 * Shared task actions for the list pages (Someday, Upcoming).
 *
 * Both pages expose the same two motions — promote a task onto Today, and
 * save an inline edit to its content — and both invalidate the same query
 * keys afterwards so every surface that reads tasks stays in sync
 * (the list itself, the Next engine, the nav counts, and the detail page).
 *
 * TodayPage is intentionally *not* a consumer: its promote motion is a
 * bench swap, not a status change, so it has its own handler.
 */
export function useTaskListActions() {
  const queryClient = useQueryClient();

  /** Promote a parked/scheduled task onto Today (the What Now chooser). */
  const promoteToToday = async (task: TaskRowTask) => {
    await updateTaskStatus({ id: task.id, status: "TODAY" });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  /** Persist an inline content edit; refreshes the list + detail views. */
  const saveTaskContent = async (task: TaskRowTask, content: string) => {
    await updateTaskContent({ taskId: task.id, content });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTask"] });
  };

  return { promoteToToday, saveTaskContent };
}
