import { useEffect, useRef, useState } from "react";
import { CloseButton } from "./CloseButton";
import "./AttachmentThumbs.css";

// The API origin for `<img>` srcs, read the same way Wasp's own client does
// (see PatSettingsPage). Empty in unknown envs → relative URLs, which work
// whenever the client is served from the API origin.
const API_URL = (import.meta.env.REACT_APP_API_URL ?? "").replace(/\/$/, "");

export function attachmentSrc(id: string): string {
  return `${API_URL}/api/attachments/${id}`;
}

export interface AttachmentThumb {
  id: string;
  filename: string;
}

/**
 * AttachmentThumbs — a calm row of captured-image thumbnails.
 *
 * Clicking a thumb opens the AttachmentLightbox (an in-app ~70% modal over a
 * dimmed backdrop) instead of navigating away — triage keeps its place. The
 * image is served by /api/attachments/:id, owner-gated via the session
 * cookie. Rendering the thumbs inline makes the "Image attached" chip
 * redundant, so wherever this appears the chip goes away — the image is the
 * indicator.
 */
export function AttachmentThumbs({
  attachments,
  size = "sm",
}: {
  attachments: AttachmentThumb[];
  size?: "sm" | "md";
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (attachments.length === 0) return null;
  return (
    <div className={`aa-attach-thumbs aa-attach-thumbs--${size}`}>
      {attachments.map((attachment, i) => (
        <button
          key={attachment.id}
          type="button"
          className="aa-attach-thumbs__open"
          onClick={() => setOpenIndex(i)}
          aria-label={`Open image ${attachment.filename}`}
          aria-haspopup="dialog"
          title={attachment.filename}
        >
          <img
            className="aa-attach-thumbs__img"
            src={attachmentSrc(attachment.id)}
            alt={attachment.filename}
            loading="lazy"
          />
        </button>
      ))}
      {openIndex !== null && (
        <AttachmentLightbox
          attachments={attachments}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * AttachmentLightbox — the full-size image viewer behind a thumbnail.
 *
 * Popover-family overlay shell (INTERACTION.md §9.2/§9.5): dimmed backdrop,
 * Esc + backdrop-click dismissal, scroll lock, focus to the close control
 * and back to the opener. With multiple images, ←/→ cycle and a muted
 * counter shows position. Keys are handled in the capture phase with
 * stopPropagation so page-level shortcuts (triage's arrows, AppShell's Esc)
 * stay quiet while the viewer is open.
 */
function AttachmentLightbox({
  attachments,
  index,
  onClose,
}: {
  attachments: AttachmentThumb[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const many = attachments.length > 1;
  const rootRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    // Focus the close control (§9.5) — CloseButton doesn't take a ref, so
    // resolve it from the mounted dialog.
    rootRef.current
      ?.querySelector<HTMLButtonElement>(".aa-lightbox__close")
      ?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      openerRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (many && e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrent((i) => (i - 1 + attachments.length) % attachments.length);
        return;
      }
      if (many && e.key === "ArrowRight") {
        e.preventDefault();
        setCurrent((i) => (i + 1) % attachments.length);
        return;
      }
      if (e.key === "Tab") {
        // Focus trap (§9.5): cycle the lightbox's own controls.
        const controls = rootRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!controls || controls.length === 0) return;
        e.preventDefault();
        const list = Array.from(controls);
        const at = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.shiftKey
          ? at <= 0
            ? list.length - 1
            : at - 1
          : at === list.length - 1
            ? 0
            : at + 1;
        list[next]?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [many, attachments.length]);

  const step = (dir: 1 | -1) =>
    setCurrent((i) => (i + dir + attachments.length) % attachments.length);

  return (
    <div
      ref={rootRef}
      className="aa-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Attached image"
      onClick={onClose}
    >
      <div className="aa-lightbox__stage" onClick={(e) => e.stopPropagation()}>
        <img
          className="aa-lightbox__img"
          src={attachmentSrc(attachments[current].id)}
          alt={attachments[current].filename}
        />
        <CloseButton
          onClose={onClose}
          label="Close image"
          className="aa-lightbox__close"
          title="Close (Esc)"
        />
        {many && (
          <>
            <button
              type="button"
              className="aa-lightbox__nav aa-lightbox__nav--prev"
              aria-label="Previous image"
              onClick={() => step(-1)}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3.5L5.5 8l4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="aa-lightbox__nav aa-lightbox__nav--next"
              aria-label="Next image"
              onClick={() => step(1)}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3.5L10.5 8l-4.5 4.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <span className="aa-lightbox__count" aria-live="polite">
              {current + 1} / {attachments.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
