import { BrandMark } from "./index";
import "./Overlays.css";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘/", "⌘K"], label: "Quick capture" },
  { keys: ["Space"], label: "Go to What Now" },
  { keys: ["?", "⌘?"], label: "Show this cheatsheet" },
  { keys: ["F"], label: "Focus mode (on a task)" },
  { keys: ["1", "2", "3"], label: "Today / Upcoming / Someday (in triage)" },
  { keys: ["[", "]"], label: "Size down / up (in triage, expanded capture)" },
  { keys: ["-", "="], label: "Priority down / up (in triage, expanded capture)" },
  { keys: ["P"], label: "Project (in triage)" },
  { keys: ["R"], label: "Resource (in triage)" },
  { keys: ["Del"], label: "Trash (in triage)" },
  { keys: ["Esc"], label: "Close / back" },
];

/**
 * ShortcutCheatsheet — centered modal listing every shortcut.
 * Toggled by `?`. Overlay pattern #04 (confirm-style: small centered, inert
 * backdrop — closes only via Esc or the Done button). See modal-approach.md.
 */
export function ShortcutCheatsheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="aa-overlay" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={onClose}>
      <div className="aa-overlay-card aa-overlay-card--sm" onClick={(e) => e.stopPropagation()}>
        <div className="aa-cheatsheet__head">
          <div className="aa-cheatsheet__mark"><BrandMark size="sm" /></div>
          <h2 className="aa-cheatsheet__title">Shortcuts</h2>
          <button type="button" className="aa-overlay__close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <ul className="aa-cheatsheet__list">
          {SHORTCUTS.map((s) => (
            <li key={s.label} className="aa-cheatsheet__row">
              <span className="aa-cheatsheet__label">{s.label}</span>
              <span className="aa-cheatsheet__keys">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="aa-cheatsheet__kbd">{k}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
