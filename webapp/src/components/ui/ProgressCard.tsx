import type { ReactNode } from "react";
import { Link } from "react-router";
import "./ProgressCard.css";

interface ProgressCardProps {
  title: string;
  description?: string | null;
  progress: number;
  progressLabel?: ReactNode;
  meta?: ReactNode;
  focusLabel?: string;
  focusValue?: ReactNode;
  focusTone?: "amber" | "muted";
  to?: string;
  className?: string;
}

/**
 * ProgressCard — calm summary card for objects that roll up work. Used by
 * Goals and Projects so progress, metadata, and focus cues stay consistent.
 */
export function ProgressCard({
  title,
  description,
  progress,
  progressLabel,
  meta,
  focusLabel,
  focusValue,
  focusTone = "amber",
  to,
  className = "",
}: ProgressCardProps) {
  const content = (
    <>
      {meta && <div className="aa-progress-card__meta">{meta}</div>}
      <span className="aa-progress-card__title">{title}</span>
      {description && <p className="aa-progress-card__desc">{description}</p>}
      <div className="aa-progress-card__progress">
        <div className="aa-progress-card__bar">
          <div className="aa-progress-card__fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="aa-progress-card__pct">{progressLabel ?? `${progress}%`}</span>
      </div>
      {focusLabel && focusValue && (
        <p className={`aa-progress-card__focus aa-progress-card__focus--${focusTone}`}>
          {focusLabel}: <span>{focusValue}</span>
        </p>
      )}
    </>
  );

  const classes = ["aa-progress-card", className].filter(Boolean).join(" ");

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
