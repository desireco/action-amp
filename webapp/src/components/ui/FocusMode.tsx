import { useEffect } from "react";
import { Button } from "./index";
import "./Overlays.css";

export interface FocusTask {
  id: string;
  title: string;
  project?: string | null;
  due?: string | null;
  size?: string | null;
  content?: string | null;
}

/**
 * FocusMode — full-screen single-task view. No sidebar, no list, no counts.
 *
 * Overlay pattern #01: takes over the viewport. Entered via `F` on a task (or
 * from Next's "Do this"). Esc exits, returning to Next.
 * From FEATURES.md F13.
 */
export function FocusMode({
  task,
  onClose,
  onComplete,
}: {
  task: FocusTask;
  onClose: () => void;
  onComplete?: () => void;
}) {
  // Esc exits focus mode (scoped handler — the global handler only knows about
  // capture/cheatsheet since focus mode is page-rendered).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="aa-focus" role="dialog" aria-modal="true" aria-label={`Focus: ${task.title}`}>
      <div className="aa-focus__top">
        <button type="button" className="aa-overlay__close" onClick={onClose} aria-label="Exit focus mode (Esc)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="aa-focus__body">
        <h1 className="aa-focus__title">{task.title}</h1>
        {(task.project || task.due || task.size) && (
          <p className="aa-focus__meta">
            {[task.project, task.due, task.size].filter(Boolean).join(" · ")}
          </p>
        )}
        {task.content && <div className="aa-focus__content">{task.content}</div>}
        <div className="aa-focus__actions">
          <Button variant="primary" onClick={onComplete}>Done</Button>
          <Button variant="secondary" onClick={onClose}>Exit focus</Button>
        </div>
      </div>
    </div>
  );
}
