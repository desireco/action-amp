<script lang="ts">
  // RowEditor — the live property chips inside an expanded list row (the
  // TaskRowEditor port, chips-only reshape). Every pick saves immediately
  // via updateTaskDetails; an Edit ghost button opens the detail page.
  // Done rows render nothing.
  import PropertyChips from "./ui/PropertyChips.svelte";
  import {
    taskPropertyFields,
    chipPickToTaskPatch,
    type PropertyPickerItem,
    type TaskChipState,
  } from "../taskView";
  import { client } from "../api";
  import type { TaskChipPatch } from "../taskView";
  import type { TaskListRowDto, TaskLensListRowDto } from "../dto";

  type RowEditorTask = TaskListRowDto & Partial<Pick<TaskLensListRowDto, "lens">>;

  let {
    task,
    lensId = null,
    onSaved,
  }: {
    task: RowEditorTask;
    /** Picker scope: the page's active lens, else the row's provenance lens. */
    lensId?: string | null;
    onSaved?: () => void | Promise<void>;
  } = $props();

  const pickerLensId = $derived(lensId ?? task.lens?.id ?? null);
  const pickerProjects = $state<PropertyPickerItem[]>([]);
  const pickerGoals = $state<PropertyPickerItem[]>([]);

  $effect(() => {
    if (task.isDone || !pickerLensId) return;
    let alive = true;
    void client.tasks
      .pickProjects({ lensId: pickerLensId })
      .then((rows) => {
        if (alive)
          pickerProjects.splice(
            0,
            pickerProjects.length,
            ...rows.map((p) => ({ id: p.id, label: p.name, meta: p.goalName ?? null })),
          );
      })
      .catch(() => {});
    void client.tasks
      .pickGoals({ lensId: pickerLensId })
      .then((rows) => {
        if (alive)
          pickerGoals.splice(
            0,
            pickerGoals.length,
            ...rows.map((g) => ({ id: g.id, label: g.name })),
          );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  });

  const chipState = $derived<TaskChipState>({
    // WONT_DO rows never render an editor; anything else reads as Upcoming.
    status: task.status === "TODAY" || task.status === "SOMEDAY" ? task.status : "UPCOMING",
    priority: task.priority ?? "NORMAL",
    size: task.size ?? "M",
    scheduledDate: task.scheduledDate ?? null,
    project: task.project,
    goal: task.goal,
  });

  const fields = $derived(
    taskPropertyFields({ task: chipState, projects: pickerProjects, goals: pickerGoals }),
  );

  async function writeTaskPatch(patch: TaskChipPatch & { projectId?: string | null; goalId?: string | null }) {
    try {
      await client.tasks.updateDetails({
        taskId: task.id,
        ...patch,
      });
      // Chips revert via the refetch on the parent — a failed pick visibly
      // doesn't stick, which is the honest signal.
      await onSaved?.();
    } catch {
      await onSaved?.();
    }
  }

  function handlePick(fieldKey: string, value: string): void {
    const patch = chipPickToTaskPatch(fieldKey, value);
    if (Object.keys(patch).length === 0) return;
    // A concrete date on a Someday task promotes it to Upcoming.
    if (fieldKey === "due" && patch.scheduledDate && task.status === "SOMEDAY") {
      patch.status = "UPCOMING";
    }
    void writeTaskPatch(patch);
  }

  function handlePickerPick(fieldKey: string, value: string | null): void {
    if (fieldKey === "project") void writeTaskPatch({ projectId: value });
    else if (fieldKey === "goal") void writeTaskPatch({ goalId: value });
  }
</script>

{#if !task.isDone}
  <div class="aa-row-editor">
    <PropertyChips
      {fields}
      onPick={handlePick}
      onPickerPick={handlePickerPick}
    />
    <a
      class="aa-row-editor__edit"
      href="/do/tasks/{task.permalink ?? task.id}"
      aria-label="Edit {task.description}"
      onclick={(e) => e.stopPropagation()}
    >
      Edit
    </a>
  </div>
{/if}

<style>
  .aa-row-editor {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .aa-row-editor__edit {
    font-size: var(--aa-text-sm);
    color: var(--aa-text-muted, oklch(0.5 0.01 240));
    text-decoration: none;
    border: 1px solid var(--aa-border, oklch(0.9 0.005 240));
    border-radius: 7px;
    padding: 0.14rem 0.55rem;
  }
  .aa-row-editor__edit:hover {
    color: var(--aa-text);
    border-color: var(--aa-teal);
  }
</style>
