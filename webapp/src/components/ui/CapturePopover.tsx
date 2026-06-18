import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import "./Overlays.css";

/**
 * CapturePopover — the universal quick-capture input (⌘K).
 *
 * Overlay pattern #02: centered card over a dimmed backdrop. Lightweight — the
 * user hasn't left their context. Auto-focuses the input; Enter submits, Esc
 * or backdrop click dismisses. (NL parsing of dates/tags lands with the capture
 * feature; for now this creates a raw InboxItem.)
 */
export function CapturePopover({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch {
      setSubmitting(false); // let the user retry; the error surfaces elsewhere
    }
  };

  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onClick={onClose}
    >
      <form
        className="aa-overlay-card aa-capture"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="aa-capture__head">
          <span className="aa-capture__mark"><BrandMark size="sm" /></span>
          <input
            ref={inputRef}
            type="text"
            className="aa-capture__input"
            placeholder="What's on your mind?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            aria-label="Capture"
          />
        </div>
        <div className="aa-capture__foot">
          <span className="aa-capture__hint">
            <kbd className="aa-capture__kbd">⏎</kbd> capture ·{" "}
            <kbd className="aa-capture__kbd">Esc</kbd> close
          </span>
        </div>
      </form>
    </div>
  );
}
