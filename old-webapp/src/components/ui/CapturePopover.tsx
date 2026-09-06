import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { BrandMark } from "./BrandMark";
import { Chip } from "./Chip";
import { CloseButton } from "./CloseButton";
import { parseCapture, type ParsedCapture } from "../../inbox/parseCapture";
import {
  calendarDayDifference,
  currentPlainDate,
  instantFrom,
  plainDateFromValue,
  systemTimeZone,
} from "../../shared/time/temporal";
import { detectMention, type MentionState } from "./detectMention";
import { getCaretCoordinates } from "./caretCoords";
import {
  MAX_IMAGE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from "../../shared/imageAttachments";
import {
  fileToDataUrl,
  imageFilesFromDataTransfer,
  rawFilesFromDataTransfer,
} from "../../shared/imageFiles";
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
 *   ⌘V / drop   → attach images (screenshots etc., up to 4, ≤5 MB each);
 *                 a drop on the closed-state FAB opens the popover with
 *                 the files preloaded via `initialFiles`
 */

interface CapturedItem {
  id: number;
  text: string;
  parsed: ParsedCapture;
  imageCount: number;
}

interface Mention {
  name: string;
  kind: "project";
  lensName?: string | null;
}

/** A not-yet-saved image: the File plus its data: URL preview (CSP-safe). */
interface PendingImage {
  file: File;
  url: string;
}

const MAX_HEIGHT_PX = 96;
const MENTION_LIMIT = 8;

export function CapturePopover({
  onClose,
  onSubmit,
  projects,
  customLensNames,
  activeLensName,
  initialFiles,
}: {
  onClose: () => void;
  onSubmit: (text: string, files?: File[]) => Promise<void> | void;
  projects: { id: string; name: string; lensName: string | null }[];
  customLensNames: string[];
  activeLensName: string | null;
  /** Files dropped on the FAB before the popover opened (consumed on mount). */
  initialFiles?: File[];
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [captured, setCaptured] = useState<CapturedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [caretIndex, setCaretIndex] = useState(0);
  const [mentionSel, setMentionSel] = useState(0);
  const [mentionPos, setMentionPos] = useState<{ top: number; left: number } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // dragenter/dragleave fire per child element — count depth so the
  // highlight stays stable while the drag moves across the card.
  const dragDepth = useRef(0);

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

  // Files dropped on the FAB before open — validated like any other add.
  // Ref-guarded: StrictMode double-fires mount effects in dev, which attached
  // the preload twice (the FAB-drop duplicate-attachment bug). addFiles also
  // dedupes by file identity as a second line of defense.
  const initialFilesConsumed = useRef(false);
  useEffect(() => {
    if (initialFilesConsumed.current) return;
    initialFilesConsumed.current = true;
    if (initialFiles?.length) void addFiles(initialFiles);
  }, []);

  /**
   * Validate + queue images. Client-side mirror of prepareImageAttachments
   * (same caps, same error copy) so bad files are rejected before submit;
   * the server still re-validates. A file already in the pending list is a
   * silent no-op — re-adding identical bytes is never the intent. Previews
   * are data: URLs, so there is nothing to revoke on remove/clear.
   */
  async function addFiles(incoming: File[]) {
    setError(null);
    const images = incoming.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      if (incoming.length > 0) setError("Only images can be attached.");
      return;
    }
    const fresh = images.filter(
      (f) => !pendingFiles.some((p) => p.file === f),
    );
    if (fresh.length === 0) return;
    const fitting = fresh.filter((f) => f.size <= MAX_IMAGE_ATTACHMENT_BYTES);
    let nextError: string | null =
      fitting.length < fresh.length ? "Each image must be 5 MB or smaller." : null;
    const room = MAX_IMAGE_ATTACHMENTS - pendingFiles.length;
    const accepted = fitting.slice(0, Math.max(0, room));
    if (accepted.length < fitting.length) {
      nextError = `Attach up to ${MAX_IMAGE_ATTACHMENTS} images at a time.`;
    }
    if (accepted.length > 0) {
      const previews = await Promise.all(
        accepted.map(async (file) => ({ file, url: await fileToDataUrl(file) })),
      );
      // Dedupe + cap again inside the updater: the await above leaves a
      // window where a second addFiles sees stale state.
      setPendingFiles((prev) => [
        ...prev,
        ...previews
          .filter((p) => !prev.some((q) => q.file === p.file))
          .slice(0, Math.max(0, MAX_IMAGE_ATTACHMENTS - prev.length)),
      ]);
    }
    setError(nextError);
  }

  function removeFile(target: PendingImage) {
    setPendingFiles((prev) => prev.filter((p) => p.url !== target.url));
  }

  function clearFiles() {
    setPendingFiles([]);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (submitting) return;
    const files = imageFilesFromDataTransfer(e.clipboardData);
    if (files.length === 0) return; // plain-text paste falls through untouched
    e.preventDefault();
    addFiles(files);
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    if (!e.dataTransfer.types.includes("Files")) return; // text drags: ignore
    dragDepth.current += 1;
    setDragging(true);
  }

  function handleDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); // never let the browser navigate away on a miss-drop
    dragDepth.current = 0;
    setDragging(false);
    if (submitting) return;
    addFiles(rawFilesFromDataTransfer(e.dataTransfer));
  }

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
    clearFiles();
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
    if ((!trimmed && pendingFiles.length === 0) || submitting) return;
    setSubmitting(true);
    try {
      const files = pendingFiles.map((p) => p.file);
      // Single-arg call when there are no files — keeps the text-only
      // contract (and its tests) unchanged.
      if (files.length > 0) await onSubmit(trimmed, files);
      else await onSubmit(trimmed);
      if (close) {
        clearFiles();
        onClose();
        return;
      }
      const p = parseCapture(trimmed, new Date(), customLensNames);
      setCaptured((prev) =>
        [
          {
            id: Date.now(),
            text: p.cleanText || (files.length > 0 ? "Image" : ""),
            parsed: p,
            imageCount: files.length,
          },
          ...prev,
        ].slice(0, 3),
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
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={cardRef}
        className={`aa-overlay-card aa-capture ${dragging ? "is-dragover" : ""}`}
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
                {item.imageCount > 0 && (
                  <Chip variant="muted" small>
                    {item.imageCount === 1 ? "1 image" : `${item.imageCount} images`}
                  </Chip>
                )}
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
            onPaste={handlePaste}
            disabled={submitting}
            aria-label="Capture"
          />
          <CloseButton
            onClose={onClose}
            label="Close without saving"
            className="aa-capture__close"
            title="Close (Esc)"
          />
        </div>

        {pendingFiles.length > 0 && (
          <div className="aa-capture__attachments" aria-label="Images to attach">
            {pendingFiles.map((p) => (
              <span key={p.url} className="aa-capture__attachment">
                <img
                  src={p.url}
                  alt={p.file.name}
                  draggable={false}
                />
                <CloseButton
                  onClose={() => removeFile(p)}
                  label={`Remove ${p.file.name}`}
                  className="aa-capture__attachment-remove"
                />
              </span>
            ))}
          </div>
        )}

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
          (parsed.parsedScheduledDate ||
            parsed.parsedSnoozedUntil ||
            parsed.parsedPriority ||
            parsed.parsedSize ||
            parsed.parsedLens ||
            parsed.parsedProject ||
            parsed.parsedTags.length > 0) && (
            <div className="aa-capture__preview">
              <ParsedCaptureChips parsed={parsed} variant="preview" />
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
            disabled={(!text.trim() && pendingFiles.length === 0) || submitting}
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
      <ParsedCaptureChips parsed={parsed} variant="captured" />
    </span>
  );
}

/**
 * Render the chips derived from a parsed capture. Two display variants share
 * the same data but differ in compactness:
 *
 *  - `preview` — the live chip preview shown while typing. Verbose: includes
 *    the calendar emoji on dates, the "Important"/"low" labels on priority,
 *    the size chip, and all tags.
 *  - `captured` — the post-commit confirmation toast. Compact: no emoji, bare
 *    ★ for important, no size chip, only the first 2 tags.
 *
 * Extracted from two near-identical inline blocks; the variant differences
 * are intentional design choices per surface.
 */
export function ParsedCaptureChips({
  parsed,
  variant,
}: {
  parsed: ParsedCapture;
  variant: "preview" | "captured";
}) {
  const verbose = variant === "preview";
  // Captured toast caps tags at 2; preview shows all.
  const tags = verbose ? parsed.parsedTags : parsed.parsedTags.slice(0, 2);
  return (
    <>
      {parsed.parsedLens && (
        <Chip variant="teal" small>
          [[{parsed.parsedLens}]]
        </Chip>
      )}
      {parsed.parsedScheduledDate && (
        <Chip variant="teal" small>
          {verbose ? `📅 ${formatPreviewDate(parsed.parsedScheduledDate)}` : formatPreviewDate(parsed.parsedScheduledDate)}
        </Chip>
      )}
      {parsed.parsedSnoozedUntil && (
        <Chip variant="teal" small>
          {formatPreviewSnooze(parsed.parsedSnoozedUntil)}
        </Chip>
      )}
      {parsed.parsedProject && (
        <Chip variant="teal" small>
          ▣ {parsed.parsedProject}
        </Chip>
      )}
      {parsed.parsedPriority === "IMPORTANT" && (
        <Chip variant="amber" small>
          {verbose ? "★ Important" : "★"}
        </Chip>
      )}
      {verbose && parsed.parsedPriority === "LOW" && (
        <Chip variant="muted" small>
          low
        </Chip>
      )}
      {verbose && parsed.parsedSize && (
        <Chip variant="default" small>
          {parsed.parsedSize}
        </Chip>
      )}
      {tags.map((t) => (
        <Chip key={t} variant="violet" small>
          {t}
        </Chip>
      ))}
    </>
  );
}

function formatPreviewDate(date: Date): string {
  const target = plainDateFromValue(date);
  const diffDays = calendarDayDifference(currentPlainDate(), target);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return target.toLocaleString(undefined, { month: "short", day: "numeric" });
}

function formatPreviewSnooze(date: Date): string {
  const value = instantFrom(date).toZonedDateTimeISO(systemTimeZone());
  const day = value.toPlainDate().equals(currentPlainDate())
    ? "today"
    : value.toPlainDate().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
      });
  return `snoozed until ${day} ${value.toPlainTime().toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}
