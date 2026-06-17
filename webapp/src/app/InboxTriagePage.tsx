import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { DispatchButton, TriageCard, Button, type TriageExit } from "../components/ui";
import "./InboxTriagePage.css";

/**
 * Inbox Triage — the Tinder-style walkthrough. One item at a time.
 *
 * Decide what each captured thing *becomes*. The dispatch decision drives the
 * exit animation direction (right/left/up/down). Keyboard shortcuts mirror the
 * on-screen buttons. From triage-tinder.html.
 *
 * Today this uses sample data; the Wasp mutations land with Tasks.
 */

interface TriageItem {
  id: string;
  text: string;
  capturedAgo: string;
  chips: { tone: "date" | "priority" | "tag"; label: string }[];
}

const SAMPLE_ITEMS: TriageItem[] = [
  {
    id: "1",
    text: "Email Sarah re: Q3 invoice tomorrow",
    capturedAgo: "captured 14 min ago",
    chips: [
      { tone: "date", label: "📅 tomorrow" },
      { tone: "priority", label: "★ Important" },
    ],
  },
  { id: "2", text: "Plan Q3 launch", capturedAgo: "captured 1 hr ago", chips: [{ tone: "tag", label: "#work" }] },
  { id: "3", text: "Competitor pricing PDF", capturedAgo: "captured yesterday", chips: [{ tone: "tag", label: "@resource" }] },
  { id: "4", text: "Pick up dry cleaning", capturedAgo: "captured this morning", chips: [{ tone: "tag", label: "#personal" }] },
  {
    id: "5",
    text: "Write blog: focus tips for ADHD",
    capturedAgo: "captured 2 days ago",
    chips: [{ tone: "tag", label: "#writing" }, { tone: "priority", label: "★ Important" }],
  },
  { id: "6", text: "Renew domain before June 30", capturedAgo: "captured 3 days ago", chips: [{ tone: "date", label: "📅 Jun 30" }] },
  { id: "7", text: "Idea: weekly review email digest", capturedAgo: "captured last week", chips: [] },
];

type Action = "task-today" | "project" | "resource" | "upcoming" | "someday" | "trash";

// Each action maps to an exit direction (the animation encodes the decision).
const ACTION_EXIT: Record<Action, TriageExit> = {
  "task-today": "right",
  project: "up",
  resource: "left",
  upcoming: "right",
  someday: "left",
  trash: "down",
};

export function InboxTriagePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState(SAMPLE_ITEMS);
  const [idx, setIdx] = useState(0);
  const [exit, setExit] = useState<TriageExit>(null);
  const [dispatched, setDispatched] = useState(false);
  const [entering, setEntering] = useState(false);

  const total = items.length;
  const done = idx;
  const isComplete = idx >= total;

  const dispatch = useCallback(
    (action: Action) => {
      if (idx >= total || exit) return; // ignore mid-animation
      setDispatched(true);
      setTimeout(() => setDispatched(false), 200);
      setExit(ACTION_EXIT[action]);
      setTimeout(() => {
        setExit(null);
        setEntering(true);
        setIdx((i) => i + 1);
        // clear entering on next frame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setEntering(false));
        });
      }, 320);
    },
    [idx, total, exit],
  );

  // Keyboard shortcuts (scoped to this page)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isComplete) return;
      const k = e.key.toLowerCase();
      const map: Record<string, Action> = {
        "1": "task-today",
        "2": "upcoming",
        "3": "someday",
        p: "project",
        r: "resource",
        delete: "trash",
        backspace: "trash",
      };
      if (map[e.key] || map[k]) {
        e.preventDefault();
        dispatch(map[e.key] || map[k]);
      } else if (e.key === "Escape") {
        navigate("/app/inbox");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, isComplete, navigate]);

  const reset = () => {
    setItems(SAMPLE_ITEMS);
    setIdx(0);
    setExit(null);
    setDispatched(false);
    setEntering(false);
  };

  if (isComplete) {
    return (
      <div className="aa-triage-empty">
        <div className="aa-triage-empty__circle" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="aa-triage-empty__title">Inbox zero.</h2>
        <p className="aa-triage-empty__text">Nothing left to decide. Go do something.</p>
        <div className="aa-triage-empty__actions">
          <Button variant="primary" onClick={() => navigate("/app")}>Done →</Button>
          <Button variant="secondary" onClick={reset}>Triage again</Button>
        </div>
      </div>
    );
  }

  const item = items[idx];

  return (
    <div className="aa-triage">
      {/* ---- Top: close + progress ---- */}
      <div className="aa-triage__top">
        <button
          type="button"
          className="aa-triage__close"
          onClick={() => navigate("/app/inbox")}
          title="Done triaging (Esc)"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="aa-triage__progress">
          <span className="aa-triage__progress-count">
            <b>{done + 1}</b> of <b>{total}</b>
          </span>
          <div className="aa-triage__progress-bar">
            <div
              className="aa-triage__progress-fill"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
        </div>
        <span className="aa-triage__top-spacer" />
      </div>

      <div className="aa-triage__title">
        <h1>What is this?</h1>
        <p>Decide what each thing becomes. It leaves the inbox for good.</p>
      </div>

      {/* ---- Card stage ---- */}
      <div className="aa-triage__stage">
        <TriageCard
          key={item.id}
          body={item.text}
          meta={item.capturedAgo}
          chips={item.chips}
          exit={exit}
          dispatched={dispatched}
          entering={entering}
        />

        {/* ---- Dispatch actions ---- */}
        <div className="aa-triage__dispatch">
          <DispatchButton
            tone="teal"
            label="Task · Today"
            sub="a quick action, due today"
            kbd="1"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
            onClick={() => dispatch("task-today")}
          />
          <DispatchButton
            tone="violet"
            label="Project"
            sub="a big outcome, multi-step"
            kbd="P"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M2 6h12" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            }
            onClick={() => dispatch("project")}
          />
          <DispatchButton
            tone="amber"
            label="Resource"
            sub="reference — link or note, filed under a project or goal"
            kbd="R"
            icon={
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M3.5 13.5V3.5a1 1 0 011-1h5.5L13 5.5v8a1 1 0 01-1 1H4.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M9.5 2.5V6h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            }
            onClick={() => dispatch("resource")}
          />
        </div>

        <div className="aa-triage__dispatch-secondary">
          <DispatchButton mini kbd="2" label="Upcoming" onClick={() => dispatch("upcoming")} />
          <DispatchButton mini kbd="3" label="Someday" onClick={() => dispatch("someday")} />
          <DispatchButton mini danger kbd="Del" label="Trash" onClick={() => dispatch("trash")} />
        </div>
      </div>
    </div>
  );
}
