import type { ReactNode } from "react";
import "./DispatchButton.css";

export type DispatchTone = "teal" | "amber" | "violet" | "rose" | "muted";

interface DispatchButtonProps {
  /** Leading icon (SVG) — required for full variant, ignored for mini */
  icon?: ReactNode;
  /** Main label */
  label: string;
  /** Helper sublabel */
  sub?: string;
  /** Keyboard shortcut hint */
  kbd?: string;
  /** Icon background tone */
  tone?: DispatchTone;
  /** Compact mini variant (icon-less, centered) */
  mini?: boolean;
  /** Dangerous styling for mini (e.g. Trash) */
  danger?: boolean;
  onClick?: () => void;
  className?: string;
}

const TONE_CLASS = {
  teal: "aa-disp__icon--teal",
  amber: "aa-disp__icon--amber",
  violet: "aa-disp__icon--violet",
  rose: "aa-disp__icon--rose",
  muted: "aa-disp__icon--muted",
} satisfies Record<DispatchTone, string>;

/**
 * DispatchButton — triage action button. Icon + label + sublabel + kbd shortcut.
 *
 * Used in the Inbox Triage walkthrough to decide what each captured item
 * becomes (Task·Today, Project, Resource, Upcoming, Someday, Trash).
 * From triage-tinder.html `.disp-btn` / `.disp-mini`.
 */
export function DispatchButton({
  icon,
  label,
  sub,
  kbd,
  tone = "teal",
  mini = false,
  danger = false,
  onClick,
  className = "",
}: DispatchButtonProps) {
  if (mini) {
    return (
      <button
        type="button"
        className={["aa-disp-mini", danger ? "aa-disp-mini--danger" : "", className]
          .filter(Boolean)
          .join(" ")}
        onClick={onClick}
      >
        {label}
        {kbd && <span className="aa-disp-mini__key">{kbd}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={["aa-disp", className].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      <span className={`aa-disp__icon ${TONE_CLASS[tone]}`}>{icon}</span>
      <span className="aa-disp__text">
        <span className="aa-disp__label">{label}</span>
        {sub && <span className="aa-disp__sub">{sub}</span>}
      </span>
      {kbd && <span className="aa-disp__key">{kbd}</span>}
    </button>
  );
}
