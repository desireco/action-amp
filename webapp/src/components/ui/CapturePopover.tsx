import { useEffect, useRef, useState } from "react";
import { BrandMark, Chip } from "./index";
import { parseCapture, type ParsedCapture } from "../../inbox/parseCapture";
import "./Overlays.css";

/**
 * CapturePopover — the universal quick-capture input (⌘/).
 *
 * Phase 1: rapid-fire + auto-grow.
 *   - Enter       → capture + clear + keep open (the 2-second dump loop)
 *   - ⌘Enter      → capture + close (the "done capturing" escape hatch)
 *   - Shift+Enter → literal newline (textarea default; expand reclaims this in Phase 3)
 *   - Esc         → close without saving (handled by the parent keymap)
 *
 * The input is an auto-growing textarea: one line, wraps, grows to ~4 lines,
 * then scrolls internally. Same element on mobile and desktop (TRIAGE.md §6).
 * A "✓ captured" stack at the top shows this session's captures, newest first.
 */

interface CapturedItem {
  id: number;
  text: string;
  parsed: ParsedCapture;
}

const MAX_HEIGHT_PX = 96; // ~4 lines at 1rem / 1.5 line-height

export function CapturePopover({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (text: string) => Promise<void> | void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedItem[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Live parse for the inline preview chips (F2).
  const parsed = text.trim() ? parseCapture(text) : null;

  // Focus on open, then grow to fit any initial value.
  useEffect(() => {
    taRef.current?.focus();
    grow();
  }, []);

  // ponytail: JS auto-grow. `field-sizing: content` (native CSS) lacks Firefox
  // support as of 2025, so 5 lines of JS wins for universal behavior. Upgrade
  // to field-sizing once Firefox ships it.
  function grow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function resetInput() {
    setText("");
    // shrink back to one line after clearing
    const el = taRef.current;
    if (el) el.style.height = "auto";
    requestAnimationFrame(() => taRef.current?.focus());
  }

  async function capture(close: boolean) {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      if (close) {
        onClose();
        return;
      }
      // rapid-fire: record the capture, clear, keep going
      const p = parseCapture(trimmed);
      setCaptured((prev) =>
        [{ id: Date.now(), text: p.cleanText, parsed: p }, ...prev].slice(0, 3),
      );
      resetInput();
    } catch {
      // leave the text in place so the user can retry; error surfaces elsewhere
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      void capture(true); // ⌘Enter → capture + close
    } else if (!e.shiftKey) {
      e.preventDefault();
      void capture(false); // Enter → rapid-fire (Shift+Enter = newline)
    }
  }

  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
      onClick={onClose}
    >
      <div
        className="aa-overlay-card aa-capture"
        onClick={(e) => e.stopPropagation()}
      >
        {/* rapid-fire captured stack (newest first) */}
        {captured.length > 0 && (
          <div className="aa-capture__captured" aria-live="polite">
            {captured.map((item) => (
              <div key={item.id} className="aa-capture__captured-item">
                <span className="aa-capture__captured-check" aria-hidden="true">
                  <svg viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6.5l2.5 2.5 4.5-5.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="aa-capture__captured-text">{item.text}</span>
                <CapturedChips parsed={item.parsed} />
              </div>
            ))}
          </div>
        )}

        <div className="aa-capture__head">
          <span className="aa-capture__mark">
            <BrandMark size="sm" />
          </span>
          <textarea
            ref={taRef}
            rows={1}
            className="aa-capture__textarea"
            placeholder={`What's on your mind?  (try: "Email Sarah tomorrow #work !3 ~20m")`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              grow();
            }}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            aria-label="Capture"
          />
          <button
            type="button"
            className="aa-overlay__close aa-capture__close"
            onClick={onClose}
            aria-label="Close without saving"
            title="Close (Esc)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {parsed &&
          (parsed.parsedDate ||
            parsed.parsedPriority ||
            parsed.parsedSize ||
            parsed.parsedTags.length > 0) && (
            <div className="aa-capture__preview">
              {parsed.parsedDate && (
                <Chip variant="teal" small>
                  📅 {formatPreviewDate(parsed.parsedDate)}
                </Chip>
              )}
              {parsed.parsedPriority === "IMPORTANT" && (
                <Chip variant="amber" small>
                  ★ Important
                </Chip>
              )}
              {parsed.parsedPriority === "LOW" && (
                <Chip variant="muted" small>
                  low
                </Chip>
              )}
              {parsed.parsedSize && (
                <Chip variant="default" small>
                  {parsed.parsedSize}
                </Chip>
              )}
              {parsed.parsedTags.map((t) => (
                <Chip
                  key={t}
                  variant={t.startsWith("@") ? "amber" : "violet"}
                  small
                >
                  {t}
                </Chip>
              ))}
            </div>
          )}

        <div className="aa-capture__foot">
          <span className="aa-capture__hint">
            <kbd className="aa-capture__kbd">⏎</kbd> capture · keep open ·{" "}
            <kbd className="aa-capture__kbd">Esc</kbd> close
          </span>
          <button
            type="button"
            className="aa-capture__save"
            disabled={!text.trim() || submitting}
            onClick={() => capture(true)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

/** Chips for a captured-stack row — same tokens as the live preview. */
function CapturedChips({ parsed }: { parsed: ParsedCapture }) {
  return (
    <span className="aa-capture__captured-chips">
      {parsed.parsedDate && (
        <Chip variant="teal" small>
          {formatPreviewDate(parsed.parsedDate)}
        </Chip>
      )}
      {parsed.parsedPriority === "IMPORTANT" && (
        <Chip variant="amber" small>
          ★
        </Chip>
      )}
      {parsed.parsedTags.slice(0, 2).map((t) => (
        <Chip key={t} variant={t.startsWith("@") ? "amber" : "violet"} small>
          {t}
        </Chip>
      ))}
    </span>
  );
}

function formatPreviewDate(date: Date): string {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
