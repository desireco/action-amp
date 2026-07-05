import "./Overlays.css";

/**
 * CloseButton — the X affordance at the top-right of every overlay (modal,
 * popover, sheet). Backed by the shared `.aa-overlay__close` style, which
 * handles the hover/focus surface.
 *
 * Extracted from ConfirmDialog, FeedbackDialog, ShortcutCheatsheet, and
 * CapturePopover, which each inlined the same button + 16×16 X-icon SVG.
 * The icon uses a 1.8 stroke (heavier than the 1.4 nav icons) so it reads
 * as a control, not decoration.
 */
export function CloseButton({
  onClose,
  label = "Close",
  className = "",
  title,
}: {
  onClose: () => void;
  /** Accessible label (defaults to "Close"; override for context-specific copy). */
  label?: string;
  /** Extra classes (e.g. a component-specific hook like `aa-capture__close`). */
  className?: string;
  /** Optional tooltip. */
  title?: string;
}) {
  const classes = ["aa-overlay__close", className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={classes}
      onClick={onClose}
      aria-label={label}
      title={title}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
