import { useEffect, type ReactNode } from "react";
import "./Overlays.css";

/**
 * BottomSheet — mobile-first overlay anchored to the bottom edge.
 *
 * Overlay pattern #03 (modal-approach.md): slides up from the bottom, anchored
 * in the thumb zone. Used for action menus and the "Not now" snooze flow.
 * Esc / backdrop click / the grabber handle all dismiss.
 *
 * Drag-to-dismiss (swipe down past 25%) lands in a later refinement — the
 * grabber is a visual affordance for now.
 */
export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Esc closes (scoped handler).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="aa-overlay aa-bottom-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Sheet"}
      onClick={onClose}
    >
      <div className="aa-bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="aa-bottom-sheet__grabber" aria-hidden="true" />
        {title && <h2 className="aa-bottom-sheet__title">{title}</h2>}
        <div className="aa-bottom-sheet__body">{children}</div>
      </div>
    </div>
  );
}
