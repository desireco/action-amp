import { useState } from "react";
import { Button, CompletionCircle } from "../ui";
import "./WhatNowCard.css";

export interface WhatNowTask {
  /** The thing to do */
  title: string;
  /** Project this task belongs to */
  project?: string;
  /** Human due label (e.g. "due today", "due Friday") */
  due?: string;
  /** Size label (e.g. "15 min", "XL") */
  size?: string;
  /** The reason this is next (rendered as the amber "why" line) */
  why?: string;
  /** Whether the "why" reason is emphasized (renders strong in amber) */
  whyEmphasis?: string;
}

interface WhatNowCardProps {
  /** The task to display */
  task: WhatNowTask;
  /** Context line above the card (e.g. "Right now · 30 min available · Work") */
  context?: string;
  /** Called when the user completes the task (circle click or "Do this" → done) */
  onComplete?: (task: WhatNowTask) => void;
  /** Called when the user defers ("Not now") */
  onNotNow?: (task: WhatNowTask) => void;
  /** Called when the user clicks "Do this" — opens focus mode / starts timer */
  onDo?: (task: WhatNowTask) => void;
}

/**
 * WhatNowCard — the composite task card. The product's wedge.
 *
 * Centered, single-task chooser. Completion circle → task title → meta line →
 * amber "why" line → Do this / Not now actions.
 *
 * From app-shell-whatnow.html + landing-home.html prototypes.
 * The app-shell version is flat (no card chrome); the landing version wraps
 * it in an elevated card. This component is the flat app-shell variant.
 */
export function WhatNowCard({ task, context, onComplete, onNotNow, onDo }: WhatNowCardProps) {
  const [filled, setFilled] = useState(false);
  const [burst, setBurst] = useState(false);
  const [doing, setDoing] = useState(false);

  const handleComplete = () => {
    setFilled(true);
    setBurst(true);
    setTimeout(() => setBurst(false), 600);
    onComplete?.(task);
  };

  const handleDo = () => {
    setDoing(true);
    onDo?.(task);
    // Brief "Done ✓" confirmation before the parent can swap the task
    setTimeout(() => {
      setFilled(true);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
    }, 100);
  };

  return (
    <div className="aa-wn-card">
      {context && <div className="aa-wn-card__context">{context}</div>}

      <div className="aa-wn-card__completion">
        <CompletionCircle size="md" filled={filled} onClick={handleComplete} className={burst ? "aa-cc--burst" : ""} />
      </div>

      <h2 className="aa-wn-card__title">{task.title}</h2>

      {(task.project || task.due || task.size) && (
        <div className="aa-wn-card__meta">
          {task.project && <span className="aa-wn-card__meta-item">{task.project}</span>}
          {task.project && task.due && <span className="aa-wn-card__sep" aria-hidden="true">·</span>}
          {task.due && <span className="aa-wn-card__meta-item">{task.due}</span>}
          {task.due && task.size && <span className="aa-wn-card__sep" aria-hidden="true">·</span>}
          {task.size && <span className="aa-wn-card__meta-item">{task.size}</span>}
        </div>
      )}

      {task.why && (
        <p className="aa-wn-card__why">
          {task.why}
          {task.whyEmphasis && <strong> {task.whyEmphasis}</strong>}
        </p>
      )}

      <div className="aa-wn-card__actions">
        <Button variant="primary" onClick={handleDo} disabled={doing}>
          {doing ? "Done ✓" : "Do this"}
        </Button>
        <Button variant="secondary" onClick={() => onNotNow?.(task)} disabled={doing}>
          Not now
        </Button>
      </div>
    </div>
  );
}
