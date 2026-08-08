import { Link } from "react-router";
import "./Button.css";
import "./CountLinkButton.css";

interface CountLinkButtonProps {
  /** Destination name shown in the button. */
  label: string;
  /** Number of open items represented by the destination. Undefined means loading. */
  count?: number;
  /** App route opened by the button. */
  to: string;
}

/**
 * CountLinkButton — a quiet secondary navigation button for moving between
 * task-list surfaces while showing how much work waits at the destination.
 */
export function CountLinkButton({ label, count, to }: CountLinkButtonProps) {
  const countLabel =
    count == null ? "loading" : `${count} ${count === 1 ? "item" : "items"}`;

  return (
    <Link
      to={to}
      className="aa-btn aa-btn--secondary aa-btn--sm aa-count-link-button"
      title={`Open ${label}`}
      aria-label={`Open ${label}, ${countLabel}`}
    >
      <span className="aa-btn__label">{label}</span>
      <span className="aa-count-link-button__count" aria-hidden="true">
        {count ?? "—"}
      </span>
    </Link>
  );
}
