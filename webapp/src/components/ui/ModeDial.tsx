import type { ReactNode } from "react";
import "./ModeDial.css";

export interface ModeDialItem {
  /** Unique mode id */
  id: string;
  /** Display label */
  label: string;
  /** Icon (SVG, emoji, or text glyph) */
  icon: ReactNode;
}

interface ModeDialProps {
  /** The available modes */
  items: ModeDialItem[];
  /** Currently-active mode id */
  active: string;
  /** Called when a mode is selected */
  onSelect: (id: string) => void;
  /** Compact variant for thumb-zone mobile bottom bar */
  variant?: "default" | "compact";
  className?: string;
}

/**
 * ModeDial — bottom-center persistent nav. The foundation of navigation.
 *
 * Pill-shaped container holding mode buttons (Plan / Do / Review).
 * Active mode gets teal-soft background + teal-cta color.
 * From mode-zoom-unified.html + mobile-gesture-modal.html + approach-c-time-adaptive.html.
 */
export function ModeDial({
  items,
  active,
  onSelect,
  variant = "default",
  className = "",
}: ModeDialProps) {
  return (
    <div
      className={["aa-dial", variant === "compact" ? "aa-dial--compact" : "", className]
        .filter(Boolean)
        .join(" ")}
      role="tablist"
      aria-label="Mode"
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={["aa-dial__btn", isActive ? "aa-dial__btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(item.id)}
          >
            <span className="aa-dial__icon">{item.icon}</span>
            <span className="aa-dial__label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
