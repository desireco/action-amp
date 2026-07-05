import type { ReactNode } from "react";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import "./Overlays.css";

/**
 * ConfirmDialog — the small centered confirmation overlay (pattern #04).
 *
 * Use for destructive or irreversible actions, rarely. Mirrors the modal
 * architecture in docs/modal-approach.md: backdrop click + Esc dismiss
 * (Esc handled by the caller's overlay keyboard wiring); the card stops
 * propagation so in-card clicks don't dismiss. The shell primitives live
 * in Overlays.css (.aa-overlay / .aa-overlay-card / .aa-overlay-card--sm).
 */
interface ConfirmDialogProps {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the rose danger style for the confirm button (destructive actions). */
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <div
      className="aa-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="aa-overlay-card aa-overlay-card--sm aa-confirm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aa-confirm__head">
          <h2 className="aa-confirm__title">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>

        <div className="aa-confirm__body">{message}</div>

        <div className="aa-confirm__foot">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
