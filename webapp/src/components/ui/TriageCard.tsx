import type { ReactNode } from "react";
import { Chip } from "./Chip";
import { Linkify } from "./Linkify";
import { AttachmentGallery, type AttachmentThumb } from "./AttachmentThumbs";
import "./TriageCard.css";

export type TriageChipTone = "date" | "priority" | "tag";

export interface TriageChip {
  tone: TriageChipTone;
  label: string;
}

export type TriageExit = "right" | "left" | "up" | "down" | null;

interface TriageCardProps {
  /** The captured item text */
  body: string;
  /** When provided, the captured text becomes an always-visible title editor. */
  onBodyChange?: (body: string) => void;
  /** Meta line (e.g. "captured 14 min ago") */
  meta?: string;
  /** Parsed-token chips */
  chips?: TriageChip[];
  /** Captured images — shown large while the item is being decided so it
      can be judged by what was shared, not just its text. Multiple images
      carousel; click opens the full-size lightbox. */
  media?: AttachmentThumb[];
  /** Exit animation direction; null = at rest */
  exit?: TriageExit;
  /** Brief confirm pulse when dispatched */
  dispatched?: boolean;
  /** Prep state (next card entering) */
  entering?: boolean;
  children?: ReactNode;
}

const CHIP_VARIANT: Record<TriageChipTone, "teal" | "amber" | "violet"> = {
  date: "teal",
  priority: "amber",
  tag: "violet",
};

/**
 * TriageCard — a single captured item during the Tinder-style triage walkthrough.
 *
 * Shows the item text, "captured X ago" meta, and parsed-token chips.
 * Exit direction encodes the dispatch decision (right/left/up/down).
 * From triage-tinder.html `.card`.
 */
export function TriageCard({
  body,
  onBodyChange,
  meta,
  chips,
  media,
  exit = null,
  dispatched = false,
  entering = false,
  children,
}: TriageCardProps) {
  const cls = [
    "aa-triage-card",
    exit ? `aa-triage-card--exit-${exit}` : "",
    dispatched ? "aa-triage-card--dispatched" : "",
    entering ? "aa-triage-card--entering" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {onBodyChange ? (
        <label className="aa-triage-card__title-field">
          <span className="aa-triage-card__title-label">Title</span>
          <textarea
            className="aa-triage-card__title-input"
            aria-label="Title"
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            rows={1}
            placeholder="What needs doing?"
          />
        </label>
      ) : (
        <p className="aa-triage-card__body">
          <Linkify text={body} />
        </p>
      )}
      {meta && <p className="aa-triage-card__meta">{meta}</p>}
      {chips && chips.length > 0 && (
        <div className="aa-triage-card__chips">
          {chips.map((c, i) => (
            <Chip key={i} variant={CHIP_VARIANT[c.tone]}>
              {c.label}
            </Chip>
          ))}
        </div>
      )}
      {media && media.length > 0 && (
        <div className="aa-triage-card__media">
          <AttachmentGallery attachments={media} />
        </div>
      )}
      {children}
    </div>
  );
}
