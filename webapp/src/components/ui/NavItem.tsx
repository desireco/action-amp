import type { ReactNode } from "react";
import "./NavItem.css";

interface NavItemProps {
  /** Leading icon (SVG) */
  icon: ReactNode;
  /** Display label */
  label: string;
  /** Whether this item is the current location */
  active?: boolean;
  /** Count badge content (string or number) */
  count?: ReactNode;
  /** Count badge variant — urgent uses amber */
  countVariant?: "default" | "urgent";
  /** Marks not-yet-built destinations */
  soon?: boolean;
  /** Click handler / link navigation */
  onClick?: () => void;
  /** Render as link with href (takes precedence over onClick) */
  to?: string;
  className?: string;
}

/**
 * NavItem — sidebar navigation item with icon, optional count badge,
 * and the signature teal left-edge active bar.
 *
 * From app-shell-whatnow.html `.nav-item`. Used in the sidebar, grouped
 * into sections by the parent.
 */
export function NavItem({
  icon,
  label,
  active = false,
  count,
  countVariant = "default",
  soon = false,
  onClick,
  to,
  className = "",
}: NavItemProps) {
  const cls = [
    "aa-nav-item",
    active ? "aa-nav-item--active" : "",
    soon ? "aa-nav-item--soon" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span className="aa-nav-item__icon">{icon}</span>
      <span className="aa-nav-item__label">{label}</span>
      {soon && <em className="aa-nav-item__soon">soon</em>}
      {count != null && !soon && (
        <span
          className={[
            "aa-nav-item__count",
            countVariant === "urgent" ? "aa-nav-item__count--urgent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {count}
        </span>
      )}
    </>
  );

  if (to) {
    return (
      <a href={to} className={cls} aria-current={active ? "page" : undefined} title={soon ? "Coming soon" : undefined}>
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={soon && !onClick}
      aria-current={active ? "page" : undefined}
      title={soon ? "Coming soon" : undefined}
    >
      {content}
    </button>
  );
}
