import { useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  useQuery,
  getProjects,
  getGoals,
  updateTaskDetails,
} from "wasp/client/operations";
import {
  Button,
  PropertyChips,
  type TaskRowTask,
} from "../components/ui";
import {
  taskPropertyFields,
  chipPickToTaskPatch,
  type TaskChipGoal,
  type TaskChipProject,
} from "./taskPropertyFields";
import "./TaskRowEditor.css";

/**
 * TaskRowEditor — the live property chips inside an expanded list row
 * (task-inline-edit spec / issue #4, reshaped 2026-08-31 per Jake: "like it
 * was before, just with the dropdowns inline").
 *
 * Every chip pick saves immediately. Title/notes editing, save/cancel, and
 * won't-do stay on the task detail page — the Edit button opens it, exactly
 * as the rows always did. Done rows render nothing.
 */
export function TaskRowEditor({
  task,
  lensId,
}: {
  task: TaskRowTask;
  /** Picker scope: the page's active lens, else the row's provenance lens. */
  lensId?: string | null;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const pickerLensId = lensId ?? task.lens?.id ?? null;
  const { data: lensProjects } = useQuery(
    getProjects,
    pickerLensId ? { lensId: pickerLensId } : undefined,
    { enabled: !!pickerLensId && !task.isDone },
  );
  const { data: lensGoals } = useQuery(
    getGoals,
    pickerLensId ? { lensId: pickerLensId } : undefined,
    { enabled: !!pickerLensId && !task.isDone },
  );

  if (task.isDone) return null;

  type TaskPatch = Omit<Parameters<typeof updateTaskDetails>[0], "taskId">;

  const writeTaskPatch = async (patch: TaskPatch) => {
    try {
      await updateTaskDetails({ taskId: task.id, ...patch });
      await Promise.all(
        [
          ["getTask"],
          ["getTasks"],
          ["getTopTask"],
          ["getProjects"],
          ["getProject"],
          ["getGoals"],
          ["getAppData"],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    } catch {
      // Chips stay on the server's values after the invalidation refetch —
      // a failed pick visibly doesn't stick, which is the honest signal.
    }
  };

  // Inline popover pick — When/Priority/Size/Due. A concrete date on a
  // Someday task promotes it to Upcoming (same rule as the detail page).
  const handlePick = (fieldKey: string, value: string): void => {
    const patch = chipPickToTaskPatch(fieldKey, value);
    if (Object.keys(patch).length === 0) return;
    if (fieldKey === "due" && patch.scheduledDate && task.status === "SOMEDAY") {
      patch.status = "UPCOMING";
    }
    void writeTaskPatch(patch);
  };
  // Bottom-sheet pick — Project/Goal. value is an id, or null for "None".
  const handlePickerPick = (fieldKey: string, value: string | null): void => {
    if (fieldKey === "project") void writeTaskPatch({ projectId: value });
    else if (fieldKey === "goal") void writeTaskPatch({ goalId: value });
  };

  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <div className="aa-row-editor">
      <PropertyChips
        fields={taskPropertyFields({
          task: {
            // Narrow the Prisma enum at the boundary: WONT_DO rows never
            // render an editor's chips, so anything else reads as Upcoming.
            status:
              task.status === "TODAY" || task.status === "SOMEDAY"
                ? task.status
                : "UPCOMING",
            priority: task.priority ?? "NORMAL",
            size: task.size ?? "M",
            scheduledDate: task.scheduledDate ?? null,
            // SAFETY: type assertion is safe — TaskRowTask's project/goal
            // shapes ({id, name}) are subsets of the chip types.
            project: (task.project as TaskChipProject | null) ?? null,
            // SAFETY: same subset narrowing as project above.
            goal: (task.goal as TaskChipGoal | null) ?? null,
          },
          projects: (lensProjects ?? []).map(
            (p: { id: string; name: string; goal?: { name: string } | null }) => ({
              id: p.id,
              label: p.name,
              meta: p.goal?.name ?? null,
            }),
          ),
          goals: (lensGoals ?? []).map((g: { id: string; name: string }) => ({
            id: g.id,
            label: g.name,
          })),
        })}
        onPick={handlePick}
        onPickerPick={handlePickerPick}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Edit ${task.description}`}
        onClick={() =>
          navigate(`/do/tasks/${task.permalink ?? task.id}`, {
            state: { returnTo },
          })
        }
      >
        Edit
      </Button>
    </div>
  );
}
