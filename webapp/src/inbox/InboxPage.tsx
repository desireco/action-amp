import { Link, useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems } from "wasp/client/operations";
import { Button, Chip, ArrowRightIcon, CalendarIcon, BoxIcon, HashIcon, StarIcon } from "../components/ui";
import { formatAgo, formatRelativeDay } from "../shared/dateFormat";
import "./InboxPage.css";
/**
 * Inbox — the capture destination. Untriaged items, newest first.
 *
 * Each row shows the captured text + parsed-token chips (date/tag/priority).
 * The "Triage" button opens the Tinder-style review walkthrough.
 */

export function InboxPage() {
  const navigate = useNavigate();
  const { data: items, isLoading } = useQuery(getInboxItems);
  const list = items ?? [];

  return (
    <div className="aa-inbox">
      <header className="aa-inbox__header">
        <div className="aa-inbox__heading">
          <h1 className="aa-inbox__title">Inbox</h1>
          {isLoading ? (
            <p className="aa-inbox__sub">…</p>
          ) : list.length > 0 ? (
            <p className="aa-inbox__sub">{list.length} to triage</p>
          ) : null}
        </div>
        {list.length > 0 && (
          <Link to="/app/inbox/review" className="aa-inbox__cta">
            <Button variant="primary" icon={<ArrowRightIcon />} iconEnd>
              Triage
            </Button>
          </Link>
        )}
      </header>

      {list.length === 0 ? (
        <div className="aa-inbox__empty">
          <div className="aa-inbox__empty-circle" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="aa-inbox__empty-text">
            Nothing left to decide. Capture something with{" "}
            <span className="aa-inbox__kbd">⌘K</span> when it crosses your mind.
          </p>
        </div>
      ) : (
        <ul className="aa-inbox__list">
          {list.map((item, i) => {
            const go = () => navigate(`/app/inbox/review?i=${i}`);
            return (
              <li
                key={item.id}
                className="aa-inbox__row"
                onClick={go}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    go();
                  }
                }}
              >
                <p className="aa-inbox__row-text">{item.text}</p>
                <div className="aa-inbox__row-meta">
                  <span className="aa-inbox__row-ago">captured {formatAgo(item.createdAt)}</span>
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
                  {item.parsedTags.map((t) => (
                    <Chip key={t} variant={t.startsWith("@") ? "amber" : "violet"} small>
                      <HashIcon className="aa-chip__icon" />
                      {t}
                    </Chip>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
