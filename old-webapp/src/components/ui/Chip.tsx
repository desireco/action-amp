import type { ReactNode, MouseEventHandler } from "react";
import "./Chip.css";

type ChipVariant = "default" | "teal" | "amber" | "violet" | "rose" | "muted";

interface ChipProps {
  /** Color variant */
  variant?: ChipVariant;
  /** Small vs default size */
  small?: boolean;
  /** Clickable */
  onClick?: MouseEventHandler<HTMLSpanElement>;
  /** Removable — shows × button */
  removable?: boolean;
  /** Callback when × is clicked */
  onRemove?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  className?: string;
}

/**
 * Chip / Badge — inline pill for tags, dates, priorities, status.
 * Supports click, remove (×), and small variant.
 */
export function Chip({
  variant = "default",
  small = false,
  onClick,
  removable = false,
  onRemove,
  children,
  className = "",
}: ChipProps) {
  const cls = [
    "aa-chip",
    `aa-chip--${variant}`,
    small ? "aa-chip--sm" : "",
    onClick ? "aa-chip--clickable" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={cls} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      {children}
      {removable && (
        <button
          type="button"
          className="aa-chip__remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(e);
          }}
          aria-label="Remove"
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
