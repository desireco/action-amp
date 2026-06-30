import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui";
import "../components/ui/Overlays.css";

type FeedbackDialogProps = {
  onSubmit: (message: string) => Promise<void>;
  onClose: () => void;
};

export function FeedbackDialog({ onSubmit, onClose }: FeedbackDialogProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const canSubmit = message.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(message.trim());
      onClose();
    } catch {
      setError("Could not send feedback. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Leave feedback"
      onClick={onClose}
    >
      <div
        className="aa-overlay-card aa-overlay-card--sm aa-feedback"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aa-feedback__head">
          <div>
            <h2 className="aa-feedback__title">Leave feedback</h2>
            <p className="aa-feedback__sub">Tell us what happened, what felt off, or what would help.</p>
          </div>
          <button
            type="button"
            className="aa-overlay__close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          className="aa-feedback__textarea"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What should we know?"
          maxLength={4000}
          disabled={submitting}
        />

        {error && <p className="aa-feedback__error">{error}</p>}

        <div className="aa-feedback__foot">
          <span className="aa-feedback__count">{message.length}/4000</span>
          <div className="aa-feedback__actions">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={!canSubmit}>
              {submitting ? "Sending" : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
