import { useState } from "react";
import { Link } from "react-router";
import { Button, Chip } from "../components/ui";
import "./InboxPage.css";

/**
 * Inbox — the capture destination. Untriaged items, newest first.
 *
 * Each row shows the captured text + parsed-token chips (date/tag/priority).
 * The "Triage" button opens the Tinder-style review walkthrough.
 *
 * Today this uses sample data; the Wasp query lands with Tasks.
 */

interface InboxItem {
  id: string;
  text: string;
  capturedAgo: string;
  chips: { tone: "date" | "priority" | "tag"; label: string }[];
}

const SAMPLE_INBOX: InboxItem[] = [
  {
    id: "1",
    text: "Email Sarah re: Q3 invoice tomorrow",
    capturedAgo: "14 min ago",
    chips: [
      { tone: "date", label: "📅 tomorrow" },
      { tone: "priority", label: "★ Important" },
    ],
  },
  {
    id: "2",
    text: "Plan Q3 launch",
    capturedAgo: "1 hr ago",
    chips: [{ tone: "tag", label: "#work" }],
  },
  {
    id: "3",
    text: "Competitor pricing PDF",
    capturedAgo: "yesterday",
    chips: [{ tone: "tag", label: "@resource" }],
  },
  {
    id: "4",
    text: "Renew domain before June 30",
    capturedAgo: "3 days ago",
    chips: [{ tone: "date", label: "📅 Jun 30" }],
  },
];

const CHIP_VARIANT = {
  date: "teal",
  priority: "amber",
  tag: "violet",
} as const;

export function InboxPage() {
  const [items, setItems] = useState(SAMPLE_INBOX);

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="aa-inbox">
      <header className="aa-inbox__header">
        <div>
          <div className="aa-inbox__eyebrow">Inbox</div>
          <h1 className="aa-inbox__title">
            {items.length > 0 ? `${items.length} to triage` : "Inbox zero"}
          </h1>
        </div>
        {items.length > 0 && (
          <Link to="/app/inbox/review">
            <Button variant="primary">Triage</Button>
          </Link>
        )}
      </header>

      {items.length === 0 ? (
        <div className="aa-inbox__empty">
          <div className="aa-inbox__empty-circle" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="aa-inbox__empty-title">Inbox zero.</h2>
          <p className="aa-inbox__empty-text">
            Nothing left to decide. Capture something with{" "}
            <span className="aa-inbox__kbd">⌘K</span> when it crosses your mind.
          </p>
        </div>
      ) : (
        <ul className="aa-inbox__list">
          {items.map((item) => (
            <li key={item.id} className="aa-inbox__row">
              <div className="aa-inbox__row-main">
                <p className="aa-inbox__row-text">{item.text}</p>
                <div className="aa-inbox__row-meta">
                  <span className="aa-inbox__row-ago">{item.capturedAgo}</span>
                  {item.chips.map((c, i) => (
                    <Chip key={i} variant={CHIP_VARIANT[c.tone]} small>
                      {c.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="aa-inbox__row-actions">
                <Link to="/app/inbox/review">
                  <Button variant="ghost" size="sm">Triage</Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
