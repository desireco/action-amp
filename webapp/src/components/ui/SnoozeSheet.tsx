import { useState } from "react";
import { BottomSheet, Chip } from "./index";
import "./Overlays.css";

export type SnoozePreset = "1h" | "3h" | "tomorrow" | "weekend" | "someday";

const PRESETS: { preset: SnoozePreset; label: string; hint: string }[] = [
  { preset: "1h", label: "In 1 hour", hint: "quick breather" },
  { preset: "3h", label: "In 3 hours", hint: "later today" },
  { preset: "tomorrow", label: "Tomorrow", hint: "9am tomorrow" },
  { preset: "weekend", label: "This weekend", hint: "Saturday" },
  { preset: "someday", label: "Someday", hint: "no date, stop nagging" },
];

/**
 * SnoozeSheet — the "Not now" flow from the Next card.
 *
 * A BottomSheet of 5 snooze presets. Calls onSnooze with the chosen preset; the
 * parent runs the mutation (snoozeTask) and closes the sheet. The task leaves
 * the focus queue until the snooze expires.
 *
 * FEATURES.md F11 + modal-approach.md §03.
 */
export function SnoozeSheet({
  taskTitle,
  onSnooze,
  onClose,
}: {
  taskTitle: string;
  onSnooze: (preset: SnoozePreset) => Promise<void> | void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<SnoozePreset | null>(null);

  const handle = async (preset: SnoozePreset) => {
    if (busy) return;
    setBusy(preset);
    try {
      await onSnooze(preset);
      onClose();
    } catch {
      setBusy(null);
    }
  };

  return (
    <BottomSheet title="Not now" onClose={onClose}>
      <p className="aa-snooze__task">
        <Chip variant="default" small>{taskTitle}</Chip>
      </p>
      <ul className="aa-snooze__list">
        {PRESETS.map((p) => (
          <li key={p.preset}>
            <button
              type="button"
              className="aa-snooze__option"
              disabled={busy !== null}
              onClick={() => handle(p.preset)}
            >
              <span className="aa-snooze__option-label">{p.label}</span>
              <span className="aa-snooze__option-hint">{p.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
