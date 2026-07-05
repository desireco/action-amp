import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BrandMark } from "./BrandMark";
import { Chip } from "./Chip";
import { parseCapture, type ParsedCapture } from "../../inbox/parseCapture";
import { detectMention, type MentionState } from "./detectMention";
import { getCaretCoordinates } from "./caretCoords";
import "./Overlays.css";

/**
 * CapturePopover — the universal quick-capture input (⌘K).
 *
 * Pure-UI component: all data (projects, lens names) arrives as props
 * from AppShell, which gates the queries on auth. The popover owns only input
 * state + the # autocomplete interaction.
 *
 *   Enter       → capture + close
 *   ⌘Enter      → capture + clear + keep open (rapid-fire)
 *   Shift+Enter → literal newline
 *   #           → opens autocomplete dropdown (projects ▣)
 *                 Arrow keys navigate, Enter/Tab accepts, Esc closes
 */

interface CapturedItem {
  id: number;
  text: string;
  parsed: ParsedCapture;
}

interface Mention {
  name: string;
  kind: "project";
  lensName?: string | null;
}

const MAX_HEIGHT_PX = 96;
const MENTION_LIMIT = 8;

export function CapturePopover({
  onClose,
  onSubmit,
  projects,
  customLensNames,
  activeLensName,
}: {
  onClose: () => void;
  onSubmit: (text: string) => Promise<void> | void;
  projects: { id: string; name: string; lensName: string | null }[];
  customLensNames: string[];
  activeLensName: string | null;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [mentionSel, setMentionSel] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const parsed = text.trim()
    ? parseCapture(text, new Date(), customLensNames)
    : null;

  // Detect an open `#`-mention at the caret.
  const mention: MentionState | null = useMemo(
    () => detectMention(text, caretIndex),
    [text, caretIndex],
  );

  // Filter projects by the mention query. Dedupe by name —
  // each lens seeds its own "General", but the dropdown should show one row per
  // name (the parser only stores the name anyway).
  const mentionMatches: Mention[] = useMemo(() => {
    if (!mention) return [];
    const q = mention.query;
    const seen = new Set<string>();
    const picks: Mention[] = [];
    for (const p of projects) {
      const key = p.name.toLowerCase();
      if (seen.has(key) || !key.startsWith(q)) continue;
      seen.add(key);
      picks.push({ name: p.name, kind: "project", lensName: p.lensName });
    }
    return picks.slice(0, MENTION_LIMIT);
  }, [mention, projects]);

  useEffect(() => {
    setMentionSel(0);
  }, [mentionMatches.length]);

  // Position the dropdown at the caret. Coordinates are card-relative (the
  // dropdown is a sibling of the head, absolutely positioned against the card).
  useEffect(() => {
    if (!mention || mentionMatches.length === 0) {
      setMentionPos(null);
      return;
    }
    const ta = taRef.current;
    const card = cardRef.current;
    if (!ta || !card) {
      setMentionPos({ top: 56, left: 16 });
      return;
    }
    try {
      const { top, left, lineHeight } = getCaretCoordinates(ta, mention.end);
      const taRect = ta.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      setMentionPos({
        top: taRect.top - cardRect.top + top + lineHeight,
        left: Math.max(taRect.left - cardRect.left + left, 0),
      });
    } catch {
      setMentionPos({ top: 56, left: 16 });
    }
  }, [mention, mentionMatches.length]);

  useEffect(() => {
    taRef.current?.focus();
    grow();
  }, []);

  function grow() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }

  function resetInput() {
    setText("");
    setCaretIndex(0);
    setMentionSel(0);
    setMentionPos(null);
    const el = taRef.current;
    if (el) el.style.height = "auto";
    requestAnimationFrame(() => taRef.current?.focus());
  }

  const acceptMention = useCallback((m: Mention) => {
    const ta = taRef.current;
    if (!ta || !mention) return;
    const before = text.slice(0, mention.at);
    const after = text.slice(mention.end);
    const inserted = /\s/.test(m.name)
      ? `#[${m.name}] `
      : `#${m.name} `;
    const next = before + inserted + after;
    const newCaret = (before + inserted).length;
    setText(next);
    setCaretIndex(newCaret);
    setMentionPos(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCaret, newCaret);
      grow();
    });
  }, [text, mention]);

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
      const p = parseCapture(trimmed, new Date(), customLensNames);
      setCaptured((prev) =>
        [{ id: Date.now(), text: p.cleanText, parsed: p }, ...prev].slice(0, 3),
      );
      resetInput();
    } catch (err) {
      console.error("[capture] submit failed:", err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not save. Your text is kept — try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSel((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSel((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const choice = mentionMatches[mentionSel] ?? mentionMatches[0];
        if (choice) acceptMention(choice);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionPos(null);
        return;
      }
    }
    if (e.key !== "Enter") return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      void capture(false);
    } else if (!e.shiftKey) {
      e.preventDefault();
      void capture(true);
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
        ref={cardRef}
        className="aa-overlay-card aa-capture"
        onClick={(e) => e.stopPropagation()}
      >
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
            placeholder={`What's on your mind?  (try: "Email Sarah tomorrow #mvp !3")`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
              setCaretIndex(e.target.selectionStart ?? e.target.value.length);
              grow();
            }}
            onKeyUp={(e) =>
              setCaretIndex(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
            }
            onClick={(e) =>
              setCaretIndex(e.currentTarget.selectionStart ?? e.currentTarget.value.length)
            }
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

        {mention && mentionMatches.length > 0 && mentionPos && (
          <div
            className="aa-capture__mention"
            style={{ top: mentionPos.top, left: mentionPos.left }}
            role="listbox"
            aria-label="Projects"
          >
            {mentionMatches.map((m, i) => (
              <button
                key={m.name}
                type="button"
                role="option"
                aria-selected={i === mentionSel}
                className={`aa-capture__mention-item ${i === mentionSel ? "active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptMention(m);
                }}
                onMouseEnter={() => setMentionSel(i)}
              >
                <span className="aa-capture__mention-mark" aria-hidden="true">
                  ▣
                </span>
                <span className="aa-capture__mention-name">{m.name}</span>
                {m.lensName && m.lensName !== activeLensName && (
                  <span className="aa-capture__mention-lens">{m.lensName}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {parsed &&
          (parsed.parsedDate ||
            parsed.parsedPriority ||
            parsed.parsedSize ||
            parsed.parsedLens ||
            parsed.parsedProject ||
            parsed.parsedTags.length > 0) && (
            <div className="aa-capture__preview">
              {parsed.parsedLens && (
                <Chip variant="teal" small>
                  [[{parsed.parsedLens}]]
                </Chip>
              )}
              {parsed.parsedDate && (
                <Chip variant="teal" small>
                  📅 {formatPreviewDate(parsed.parsedDate)}
                </Chip>
              )}
              {parsed.parsedProject && (
                <Chip variant="teal" small>
                  ▣ {parsed.parsedProject}
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
                <Chip key={t} variant="violet" small>
                  {t}
                </Chip>
              ))}
            </div>
          )}

        <div className="aa-capture__foot">
          <span className="aa-capture__hint">
            {error ? (
              <span className="aa-capture__error" role="alert">
                {error}
              </span>
            ) : (
              <>
                <kbd className="aa-capture__kbd">⏎</kbd> save ·{" "}
                <kbd className="aa-capture__kbd">⌘⏎</kbd> add another ·{" "}
                <kbd className="aa-capture__kbd">Esc</kbd> close
              </>
            )}
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

function CapturedChips({ parsed }: { parsed: ParsedCapture }) {
  return (
    <span className="aa-capture__captured-chips">
      {parsed.parsedLens && (
        <Chip variant="teal" small>
          [[{parsed.parsedLens}]]
        </Chip>
      )}
      {parsed.parsedDate && (
        <Chip variant="teal" small>
          {formatPreviewDate(parsed.parsedDate)}
        </Chip>
      )}
      {parsed.parsedProject && (
        <Chip variant="teal" small>
          ▣ {parsed.parsedProject}
        </Chip>
      )}
      {parsed.parsedPriority === "IMPORTANT" && (
        <Chip variant="amber" small>
          ★
        </Chip>
      )}
      {parsed.parsedTags.slice(0, 2).map((t) => (
        <Chip key={t} variant="violet" small>
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
