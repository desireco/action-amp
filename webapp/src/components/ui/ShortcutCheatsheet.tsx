import { BrandMark } from "./BrandMark";
import "./Overlays.css";

/**
 * ShortcutCheatsheet — the keyboard reference modal.
 *
 * Triggered by `?` (bare, outside text fields) or `⌘?` (Cmd+Shift+/, works in
 * Chrome/Firefox; Safari's Help menu intercepts it, so a visible `?` button in
 * the topbar is the always-works fallback). See TRIAGE.md §7.2.
 *
 * Grouped by context, not a flat list — mirrors the modal architecture: each
 * mode has its own keyset, and the cheatsheet shows them as sections.
 */

interface ShortcutItem {
  keys: string[];
  label: string;
  note?: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

const SECTIONS: ShortcutSection[] = [
  {
    title: "Global",
    items: [
      { keys: ["⌘K"], label: "Capture", note: "works in text fields" },
      { keys: ["Space"], label: "Go to Next" },
      { keys: ["?"], label: "Show this sheet", note: "also ⌘?" },
      { keys: ["Esc"], label: "Close / back" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { keys: ["⇧I"], label: "Inbox" },
      { keys: ["⇧N"], label: "Next" },
      { keys: ["⇧T"], label: "Today" },
      { keys: ["⇧G"], label: "Triage", note: "triaGe" },
      { keys: ["⇧P"], label: "Planning" },
      { keys: ["⇧R"], label: "Review" },
      { keys: ["⇧C"], label: "Capture", note: "also ⌘K" },
    ],
  },
  {
    title: "In capture",
    items: [
      { keys: ["⏎"], label: "Capture and close" },
      { keys: ["⌘⏎"], label: "Capture, keep open", note: "rapid-fire" },
      { keys: ["⇧⏎"], label: "New line" },
    ],
  },
  {
    title: "In triage",
    items: [
      { keys: ["1", "2", "3"], label: "Today / Upcoming / Someday" },
      { keys: ["P"], label: "Make a Project" },
      { keys: ["R"], label: "Make a Resource" },
      { keys: ["Del"], label: "Trash" },
      { keys: ["←", "→"], label: "Previous / next item" },
    ],
  },
  {
    title: "Properties",
    items: [
      { keys: ["[", "]"], label: "Size down / up" },
      { keys: ["-", "="], label: "Priority down / up" },
    ],
  },
];

export function ShortcutCheatsheet({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="aa-overlay-card aa-cheatsheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aa-cheatsheet__head">
          <div className="aa-cheatsheet__mark">
            <BrandMark size="sm" />
          </div>
          <div className="aa-cheatsheet__heading">
            <h2 className="aa-cheatsheet__title">Shortcuts</h2>
            <p className="aa-cheatsheet__sub">by mode</p>
          </div>
          <button
            type="button"
            className="aa-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="aa-cheatsheet__sections">
          {SECTIONS.map((section) => (
            <section key={section.title} className="aa-cheatsheet__section">
              <h3 className="aa-cheatsheet__section-title">{section.title}</h3>
              <ul className="aa-cheatsheet__list">
                {section.items.map((item) => (
                  <li key={item.label} className="aa-cheatsheet__row">
                    <span className="aa-cheatsheet__label">
                      {item.label}
                      {item.note && (
                        <span className="aa-cheatsheet__note">
                          {"  "}· {item.note}
                        </span>
                      )}
                    </span>
                    <span className="aa-cheatsheet__keys">
                      {item.keys.map((k, i) => (
                        <kbd key={i} className="aa-cheatsheet__kbd">
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="aa-cheatsheet__foot">
          <span className="aa-cheatsheet__tip">
            Shortcuts change by mode — what works in capture may differ in triage.
          </span>
          <button
            type="button"
            className="aa-cheatsheet__done"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
