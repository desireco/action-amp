import { BottomSheet } from "./BottomSheet";
import "./PickerSheet.css";

export interface PickerSheetItem {
  id: string;
  label: string;
  meta?: string | null;
  current?: boolean;
}

export interface PickerSheetAction {
  label: string;
  onPick: () => void;
}

interface PickerSheetProps {
  title: string;
  items: PickerSheetItem[];
  emptyMessage?: string;
  action?: PickerSheetAction;
  onPick: (id: string) => void;
  onClose: () => void;
}

/**
 * PickerSheet — shared bottom-sheet list for choosing one Project, Goal, or
 * similar destination. Keeps the sheet rhythm consistent across flows.
 */
export function PickerSheet({
  title,
  items,
  emptyMessage,
  action,
  onPick,
  onClose,
}: PickerSheetProps) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      {items.length === 0 && emptyMessage ? (
        <p className="aa-picker-sheet__empty">{emptyMessage}</p>
      ) : (
        <ul className="aa-picker-sheet__list">
          {items.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`aa-picker-sheet__item ${item.current ? "current" : ""}`}
                onClick={() => onPick(item.id)}
              >
                <span className="aa-picker-sheet__name">{item.label}</span>
                {item.meta && <span className="aa-picker-sheet__meta">{item.meta}</span>}
                <span className="aa-picker-sheet__num">{index + 1}</span>
              </button>
            </li>
          ))}
          {action && (
            <li>
              <button
                type="button"
                className="aa-picker-sheet__item aa-picker-sheet__item--action"
                onClick={action.onPick}
              >
                <span className="aa-picker-sheet__name">{action.label}</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </BottomSheet>
  );
}
