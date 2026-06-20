import { useState } from "react";
import { BottomSheet, Chip } from "./index";
import "./Overlays.css";

export interface PickerProject {
  id: string;
  name: string;
  goalName?: string | null;
}
export interface PickerGoal {
  id: string;
  name: string;
}

/**
 * ResourcePickerSheet — picks a parent Project or Goal for a Resource.
 *
 * Resources must be filed under exactly one Project or Goal (DATA-MODEL.md §1).
 * Opens when the user clicks "Resource" during triage. Lists projects grouped
 * by goal, then standalone goals. Returns the chosen parent via onPick.
 */
export function ResourcePickerSheet({
  resourceTitle,
  projects,
  goals,
  onPick,
  onClose,
}: {
  resourceTitle: string;
  projects: PickerProject[];
  goals: PickerGoal[];
  onPick: (parent: { projectId: string } | { goalId: string }) => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handle = async (parent: { projectId: string } | { goalId: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      await onPick(parent);
      onClose();
    } catch {
      setBusy(false);
    }
  };

  // Group projects by goal name (or "Standalone").
  const grouped = projects.reduce<Record<string, PickerProject[]>>((acc, p) => {
    const key = p.goalName ?? "Standalone";
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  return (
    <BottomSheet title="File under…" onClose={onClose}>
      <p className="aa-snooze__task">
        <Chip variant="amber" small>📎 {resourceTitle}</Chip>
      </p>
      <div className="aa-picker__body">
        {Object.entries(grouped).map(([goalName, items]) => (
          <div key={goalName} className="aa-picker__group">
            <h3 className="aa-picker__group-label">{goalName}</h3>
            {items.map((p) => (
              <button
                key={p.id}
                type="button"
                className="aa-picker__option"
                disabled={busy}
                onClick={() => handle({ projectId: p.id })}
              >
                <span className="aa-picker__option-label">{p.name}</span>
                <span className="aa-picker__option-hint">project</span>
              </button>
            ))}
          </div>
        ))}
        {goals.length > 0 && (
          <div className="aa-picker__group">
            <h3 className="aa-picker__group-label">Goals</h3>
            {goals.map((g) => (
              <button
                key={g.id}
                type="button"
                className="aa-picker__option"
                disabled={busy}
                onClick={() => handle({ goalId: g.id })}
              >
                <span className="aa-picker__option-label">{g.name}</span>
                <span className="aa-picker__option-hint">goal</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
