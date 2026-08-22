import { useQueryClient } from "@tanstack/react-query";
import { updateTaskStatus } from "wasp/client/operations";
import type { TaskRowTask } from "../components/ui";

/**
 * Shared task actions for the list pages (Someday, Upcoming).
 *
 * Both pages promote a parked/scheduled task onto Today and invalidate the
 * same query keys afterwards so every surface that reads tasks stays in sync
 * (the list itself, the Next engine, the nav counts, and the detail page).
 *
 * TodayPage is intentionally *not* a consumer: its promote motion is a
 * bench swap, not a status change, so it has its own handler.
 *
 * Inline content edits used to live here too, but the row no longer edits
 * notes — that moved to the task detail page's chip-popover editor.
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

  /** Park a task without a date. Someday must never retain a stale deadline. */
  const moveToSomeday = async (task: TaskRowTask) => {
    await updateTaskStatus({ id: task.id, status: "SOMEDAY", scheduledDate: null });
    queryClient.invalidateQueries({ queryKey: ["getTasks"] });
    queryClient.invalidateQueries({ queryKey: ["getTopTask"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  };

  return { promoteToToday, moveToSomeday };
}
