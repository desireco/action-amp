import type { ReactNode } from "react";
import "./LensSwitch.css";

export interface LensSwitchOption {
  /** Unique id */
  id: string;
  /** Display label */
  label: string;
  /** Optional leading icon */
  icon?: ReactNode;
  /** Identity color key ("indigo", "emerald"); rendered as a dot + data attr */
  color?: string | null;
  /**
   * Count of open Today tasks in this lens. Rendered as a small badge on the
   * button, but ONLY when > 0 — a 0 badge would be noise (and a guilt dot,
   * which the product bans).
   */
  count?: number;
}

interface LensSwitchProps {
  /** The available lenses (usually Work / Me) */
  options: LensSwitchOption[];
  /** Currently-active lens id */
  active: string;
  /** Called when a lens is selected */
  onSelect: (id: string) => void;
  /** Accessible label for the group */
  ariaLabel?: string;
  className?: string;
}

/**
 * LensSwitch — segmented control for switching between life contexts
 * (Work / Me). Sits at the top of the sidebar.
 *
 * From app-shell-whatnow.html `.lens`. Distinct from ModeDial (which switches
 * operational modes Plan/Do/Review at the bottom of the screen).
 */
export function LensSwitch({
  options,
  active,
  onSelect,
  ariaLabel = "Lens",
  className = "",
}: LensSwitchProps) {
  return (
    <div
      className={["aa-lens", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            type="button"
            className={["aa-lens__btn", isActive ? "aa-lens__btn--active" : ""]
              .filter(Boolean)
              .join(" ")}
            role="tab"
            aria-selected={isActive}
            data-lens-color={opt.color || undefined}
            onClick={() => onSelect(opt.id)}
          >
            {opt.icon && <span className="aa-lens__icon">{opt.icon}</span>}
            {opt.color && <span className="aa-lens__dot" aria-hidden="true" />}
            <span className="aa-lens__label">{opt.label}</span>
            {opt.count != null && opt.count > 0 && (
              <span className="aa-lens__count" aria-label={`${opt.count} today tasks`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
