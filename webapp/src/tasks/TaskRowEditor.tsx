import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useQuery,
  getProjects,
  getGoals,
  updateTaskDetails,
  updateTaskStatus,
} from "wasp/client/operations";
import {
  Button,
  CloseButton,
  ConfirmDialog,
  PropertyChips,
  submitOnModEnter,
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
 * TaskRowEditor — inline task editing inside an expanded list row
 * (task-inline-edit spec / issue #4).
 *
 * Two modes, both one level up from the task detail page:
 *  - chips (default): the same live PropertyChips row as the detail page —
 *    every pick saves immediately (autosave).
 *  - editing: title + notes working copy with Save / Cancel and the same
 *    non-destructive decline (won't do + confirm) as the detail page.
 *
 * The detail page stays the deep surface (URL, breadcrumbs, attachments,
 * outcome, done-task feedback); this is the common-edit shortcut. Done rows
 * render nothing — completed tasks are closed.
 */
export function TaskRowEditor({
  task,
  lensId,
  onClose,
}: {
  task: TaskRowTask;
  /** Picker scope: the page's active lens, else the row's provenance lens. */
  lensId?: string | null;
  /** Collapse the row (called after won't do removes the task from the list). */
  onClose?: () => void;
}) {
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

  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [content, setContent] = useState(task.content ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wontDoConfirmOpen, setWontDoConfirmOpen] = useState(false);

  // Working copy tracks the server row unless the user is mid-edit (same
  // reset-on-task pattern as the detail page; a structural pick refreshes the
  // task and would otherwise leave stale prose in the inputs).
  useEffect(() => {
    if (!editing) {
      setDescription(task.description);
      setContent(task.content ?? "");
    }
  }, [editing, task.description, task.content]);

  if (task.isDone) return null;

  const canSave =
    description.trim().length > 0 &&
    !saving &&
    (description.trim() !== task.description ||
      content.trim() !== (task.content ?? ""));

  type TaskPatch = Omit<Parameters<typeof updateTaskDetails>[0], "taskId">;

  const invalidateTaskQueries = async (logbookToo = false) => {
    const keys = [
      ["getTask"],
      ["getTasks"],
      ["getTopTask"],
      ["getProjects"],
      ["getProject"],
      ["getGoals"],
      ["getAppData"],
      ...(logbookToo ? [["getLogbook"]] : []),
    ];
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  const writeTaskPatch = async (patch: TaskPatch) => {
    setError(null);
    try {
      await updateTaskDetails({ taskId: task.id, ...patch });
      await invalidateTaskQueries();
    } catch {
      setError("Couldn't update that. Try again.");
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

  const saveTask = async () => {
    if (!task || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateTaskDetails({
        taskId: task.id,
        description: description.trim(),
        content,
      });
      await invalidateTaskQueries();
      setEditing(false);
    } catch {
      setError("Could not save task.");
    } finally {
      setSaving(false);
    }
  };

  // Won't do — the decline, identical to the detail page: WONT_DO status,
  // confirm dialog first, restore lives in the Logbook.
  const markWontDo = async () => {
    try {
      await updateTaskStatus({ id: task.id, status: "WONT_DO" });
      await invalidateTaskQueries(true);
      onClose?.();
    } catch {
      setError("Could not mark as won't-do.");
    }
  };

  return (
    <div className={`aa-row-editor${editing ? " aa-row-editor--editing" : ""}`}>
      {editing ? (
        <>
          <input
            className="aa-row-editor__input"
            aria-label="Task title"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <textarea
            className="aa-row-editor__textarea"
            aria-label="Task notes"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(e) => submitOnModEnter(e, () => void saveTask())}
            placeholder="Add details, links, or next steps."
            rows={3}
          />
          {error && <p className="aa-row-editor__err">{error}</p>}
          <div className="aa-row-editor__actions">
            <CloseButton
              label="Mark as won't do"
              title="Mark as won't do"
              onClose={() => setWontDoConfirmOpen(true)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={!canSave}
              onClick={() => void saveTask()}
            >
              {saving ? "Saving" : "Save"}
            </Button>
          </div>
        </>
      ) : (
        <>
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
            onClick={() => setEditing(true)}
            aria-label="Edit title and notes"
          >
            Edit
          </Button>
          {error && <p className="aa-row-editor__err">{error}</p>}
        </>
      )}

      {wontDoConfirmOpen && (
        <ConfirmDialog
          title="Mark as won't do?"
          message="It leaves your lists and surfaces in the Logbook, where you can restore it."
          confirmLabel="Mark won't do"
          cancelLabel="Keep task"
          danger
          onConfirm={() => {
            setWontDoConfirmOpen(false);
            void markWontDo();
          }}
          onClose={() => setWontDoConfirmOpen(false)}
        />
      )}
    </div>
  );
}
