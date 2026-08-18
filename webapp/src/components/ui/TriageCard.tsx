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
  /** Exit the body editor on blur — the card returns to its reading view. */
  onBodyBlur?: () => void;
  /** Show the edit affordance on the read-only body (Classify step) — the
   *  body stays a linkified reading surface until the user asks to edit. */
  onBodyEdit?: () => void;
  /** Focus the editor on mount (used when an explicit edit toggle opened it). */
  autoFocusBody?: boolean;
  /** Editor label — "Title" when the edit names the future entity (Spec
   *  step), "Captured text" when it edits the stored InboxItem (Classify). */
  bodyLabel?: string;
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
  onBodyBlur,
  onBodyEdit,
  autoFocusBody = false,
  bodyLabel = "Title",
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
          <span className="aa-triage-card__title-label">{bodyLabel}</span>
          <textarea
            className="aa-triage-card__title-input"
            aria-label={bodyLabel}
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            onBlur={onBodyBlur}
            autoFocus={autoFocusBody}
            rows={1}
            placeholder="What needs doing?"
          />
        </label>
      ) : (
        <div className="aa-triage-card__body-wrap">
          <p
            className={`aa-triage-card__body${onBodyEdit ? " aa-triage-card__body--editable" : ""}`}
            onClick={
              onBodyEdit
                ? (event) => {
                    // Click-the-text-to-edit (the simple-list rename pattern).
                    // A click on a linkified URL is the link's own — open it,
                    // don't turn the body into an editor.
                    if ((event.target as HTMLElement).closest("a")) return;
                    onBodyEdit();
                  }
                : undefined
            }
          >
            <Linkify text={body} />
          </p>
          {onBodyEdit && (
            <button
              type="button"
              className="aa-triage-card__body-edit"
              onClick={onBodyEdit}
              aria-label={`Edit ${bodyLabel.toLowerCase()}`}
              title={`Edit ${bodyLabel.toLowerCase()}`}
            >
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M11.3 2.6l2.1 2.1L6 12.1l-2.8.7.7-2.8L11.3 2.6z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
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
