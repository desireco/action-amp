import { useEffect, useRef, useState } from "react";
import { BrandMark, Chip } from "./index";
import { parseCapture } from "../../inbox/parseCapture";
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

  // Live parse for the inline preview chips (F2).
  const parsed = text.trim() ? parseCapture(text) : null;

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
            placeholder={`What's on your mind?  (try: "Email Sarah tomorrow #work !3 ~20m")`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={submitting}
            aria-label="Capture"
          />
        </div>
        {parsed && (parsed.parsedDate || parsed.parsedPriority || parsed.parsedSize || parsed.parsedTags.length > 0) && (
          <div className="aa-capture__preview">
            {parsed.parsedDate && <Chip variant="teal" small>📅 {formatPreviewDate(parsed.parsedDate)}</Chip>}
            {parsed.parsedPriority === "IMPORTANT" && <Chip variant="amber" small>★ Important</Chip>}
            {parsed.parsedPriority === "LOW" && <Chip variant="muted" small>low</Chip>}
            {parsed.parsedSize && <Chip variant="default" small>{parsed.parsedSize}</Chip>}
            {parsed.parsedTags.map((t) => (
              <Chip key={t} variant={t.startsWith("@") ? "amber" : "violet"} small>{t}</Chip>
            ))}
          </div>
        )}
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

function formatPreviewDate(date: Date): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
