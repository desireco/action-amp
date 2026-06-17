import type { ReactNode } from "react";
import "./ZoomDock.css";

export interface ZoomDockItem {
  /** Unique zoom level id (e.g. "task", "project", "goal") */
  id: string;
  /** Icon (SVG) */
  icon: ReactNode;
  /** Accessible label / tooltip */
  label: string;
}

interface ZoomDockProps {
  /** Zoom levels, ordered deepest→shallowest or vice versa */
  items: ZoomDockItem[];
  /** Currently-active zoom id */
  active: string;
  /** Called when a zoom level is selected */
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * ZoomDock — Task/Project/Goal zoom controls.
 *
 * Pill-shaped container holding icon-only zoom buttons. Active level gets
 * teal-soft background. Docked beside the ModeDial in the bottom cluster.
 * From mode-zoom-unified.html + approach-a-zoom-pan.html.
 */
export function ZoomDock({ items, active, onSelect, className = "" }: ZoomDockProps) {
  return (
    <div
      className={["aa-zoom-dock", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label="Zoom level"
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            className={["aa-zoom-dock__btn", isActive ? "aa-zoom-dock__btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            role="tab"
            aria-selected={isActive}
            title={item.label}
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
          >
            {item.icon}
          </button>
        );
      })}
    </div>
  );
}
