import { Link } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems } from "wasp/client/operations";
import type { InboxItem } from "@prisma/client";
import { Chip, ArrowRightIcon, CalendarIcon, BoxIcon, HashIcon, StarIcon } from "../components/ui";
import { formatAgo, formatRelativeDay } from "../shared/dateFormat";
import "./InboxPage.css";

type InboxItemWithAttachments = InboxItem & {
  attachments: { id: string; filename: string; mimeType: string }[];
};
/**
 * Inbox — the capture destination. Untriaged items, newest first.
 *
 * Each row shows the captured text + parsed-token chips (date/tag/priority).
 * The "Triage" button opens the Tinder-style review walkthrough.
 */

export function InboxPage() {
  const { data: items, isLoading } = useQuery(getInboxItems);
  const list = items ?? [];
  const countLabel = `${list.length} ${list.length === 1 ? "captured thought" : "captured thoughts"}`;

  return (
    <div className="aa-inbox">
      <header className="aa-inbox__header">
        <p className="aa-inbox__eyebrow">Universal inbox</p>
        <h1 className="aa-inbox__title">Inbox</h1>
        <p className="aa-inbox__sub">
          Everything you capture waits here until you decide where it belongs.
        </p>
      </header>

      <section className="aa-inbox__surface" aria-label="Captured thoughts">
        {isLoading ? (
          <div className="aa-inbox__loading" aria-label="Loading inbox">
            <span className="aa-inbox__loading-line aa-inbox__loading-line--short" />
            <span className="aa-inbox__loading-line" />
            <span className="aa-inbox__loading-line aa-inbox__loading-line--mid" />
          </div>
        ) : list.length === 0 ? (
          <div className="aa-inbox__empty">
            <div className="aa-inbox__empty-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 7.5h14v10H5z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 14h4l1.5 2h3l1.5-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 4.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="aa-inbox__empty-title">Inbox clear</h2>
            <p className="aa-inbox__empty-text">
              Nothing is waiting for a decision. Capture a thought whenever it
              crosses your mind.
            </p>
            <p className="aa-inbox__empty-hint">
              Capture anytime <span className="aa-inbox__kbd">⌘K</span>
            </p>
          </div>
        ) : (
          <>
            <div className="aa-inbox__queue-header">
              <div>
                <p className="aa-inbox__queue-title">Waiting for a decision</p>
                <p className="aa-inbox__queue-count">{countLabel} · newest first</p>
              </div>
              <Link to="/app/inbox/review" className="aa-inbox__cta">
                <span>Start triage</span>
                <ArrowRightIcon />
              </Link>
            </div>
            <ul className="aa-inbox__list">
              {list.map((item: InboxItemWithAttachments, i: number) => (
                <li key={item.id} className="aa-inbox__item">
                  <Link to={`/app/inbox/review?i=${i}`} className="aa-inbox__row">
                    <div className="aa-inbox__row-content">
                      <InboxPreview item={item} />
                      <div className="aa-inbox__row-meta">
                        <span className="aa-inbox__row-ago">captured {formatAgo(item.createdAt)}</span>
                        {item.sourceUrl && <Chip variant="teal" small>Link attached</Chip>}
                        {item.attachments.length > 0 && <Chip variant="teal" small>Image attached</Chip>}
                        {item.parsedDate && (
                          <Chip variant="teal" small>
                            <CalendarIcon className="aa-chip__icon" />
                            {formatRelativeDay(item.parsedDate)}
                          </Chip>
                        )}
                        {item.parsedProject && (
                          <Chip variant="teal" small>
                            <BoxIcon className="aa-chip__icon" />
                            {item.parsedProject}
                          </Chip>
                        )}
                        {item.parsedPriority === "IMPORTANT" && (
                          <Chip variant="amber" small>
                            <StarIcon className="aa-chip__icon" />
                            Important
                          </Chip>
                        )}
                        {item.parsedPriority === "LOW" && <Chip variant="muted" small>low</Chip>}
                        {item.parsedSize && <Chip variant="default" small>{item.parsedSize}</Chip>}
                        {item.parsedTags.map((t: string) => (
                          <Chip key={t} variant={t.startsWith("@") ? "amber" : "violet"} small>
                            <HashIcon className="aa-chip__icon" />
                            {t}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <ArrowRightIcon className="aa-inbox__row-arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function InboxPreview({ item }: { item: Pick<InboxItem, "text" | "title" | "content"> }) {
  const title = item.title?.trim() || item.text;
  // Some shares created before structured fields were consistently sent store
  // the same composed value in both `text` and `content`. Keep the capture
  // readable: render that value once, while preserving a genuinely distinct
  // body for current structured shares.
  const content = item.content?.trim();
  const showContent = content && normalizePreview(content) !== normalizePreview(title);

  return (
    <>
      <p className="aa-inbox__row-text">{title}</p>
      {showContent && <p className="aa-inbox__row-content-text">{content}</p>}
    </>
  );
}

function normalizePreview(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
