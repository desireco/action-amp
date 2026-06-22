import { Link } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getInboxItems } from "wasp/client/operations";
import { Button, Chip } from "../components/ui";
import "./InboxPage.css";
/**
 * Inbox — the capture destination. Untriaged items, newest first.
 *
 * Each row shows the captured text + parsed-token chips (date/tag/priority).
 * The "Triage" button opens the Tinder-style review walkthrough.
 */

export function InboxPage() {
  const { data: items, isLoading } = useQuery(getInboxItems);
  const list = items ?? [];

  return (
    <div className="aa-inbox">
      <header className="aa-inbox__header">
        <div>
          <h1 className="aa-inbox__title">
            {isLoading ? "Loading…" : list.length > 0 ? `${list.length} to triage` : "Inbox zero"}
          </h1>
        </div>
        {list.length > 0 && (
          <Link to="/app/inbox/review">
            <Button variant="primary">Triage</Button>
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
            <span className="aa-inbox__kbd">⌘/</span> when it crosses your mind.
          </p>
        </div>
      ) : (
        <ul className="aa-inbox__list">
          {list.map((item) => (
            <li key={item.id} className="aa-inbox__row">
              <div className="aa-inbox__row-main">
                <p className="aa-inbox__row-text">{item.text}</p>
                <div className="aa-inbox__row-meta">
                  <span className="aa-inbox__row-ago">captured {formatAgo(item.createdAt)}</span>
                  {item.parsedDate && <Chip variant="teal" small>📅 {formatParsedDate(item.parsedDate)}</Chip>}
                  {item.parsedPriority === "IMPORTANT" && <Chip variant="amber" small>★ Important</Chip>}
                  {item.parsedPriority === "LOW" && <Chip variant="muted" small>low</Chip>}
                  {item.parsedSize && <Chip variant="default" small>{item.parsedSize}</Chip>}
                  {item.parsedTags.map((t) => (
                    <Chip key={t} variant={t.startsWith("@") ? "amber" : "violet"} small>{t}</Chip>
                  ))}
                </div>
              </div>
              <div className="aa-inbox__row-actions">
                <Link to="/app/inbox/review">
                  <Button variant="ghost" size="sm">Triage</Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

function formatParsedDate(date: Date): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
