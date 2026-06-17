import { useState } from "react";
import { WhatNowCard, type WhatNowTask } from "../components/ui";
import "./WhatNowPage.css";

/**
 * The home screen — "What Now". The product's wedge: not a list, a chooser.
 *
 * Renders the WhatNowCard for the current top task, or a calm empty state.
 * Today this uses sample data; the focus engine (priority → size → due,
 * scoped to the active Lens) lands once Tasks exist.
 */

// Sample task — stands in for the focus engine until Tasks ship.
// Easy to swap: replace with a Wasp query returning the top task.
const SAMPLE_TASK: WhatNowTask = {
  title: "Email Sarah re: Q3 invoice",
  project: "Ship product v2",
  due: "due today",
  size: "15 min",
  why: "Because it's",
  whyEmphasis: "Important and due today.",
};

export function WhatNowPage() {
  const [hasTask, setHasTask] = useState(true);

  const handleComplete = () => {
    // For now: completing the sample task reveals the empty state.
    // With a backend: advance to the next candidate task.
    setHasTask(false);
  };

  if (!hasTask) {
    return (
      <div className="aa-wn">
        <div className="aa-wn-eyebrow">What now</div>
        <h1 className="aa-wn-empty">Nothing on the table.</h1>
        <p className="aa-wn-empty-sub">
          You're all caught up. Capture something new with{" "}
          <span className="aa-wn-kbd">⌘K</span> when it crosses your mind.
        </p>
      </div>
    );
  }

  return (
    <WhatNowCard
      task={SAMPLE_TASK}
      context="Right now · 30 min available · Work"
      onComplete={handleComplete}
      onDo={handleComplete}
      onNotNow={() => {
        /* TODO: open snooze bottom sheet (see modal-approach.md §03) */
      }}
    />
  );
}
