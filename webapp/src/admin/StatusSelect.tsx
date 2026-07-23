import { useEffect, useRef, useState } from "react";
import { Chip, ConfirmDialog } from "../components/ui";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "../feedback/operationsCore";
import "./StatusSelect.css";

/** Display label + chip color per status. */
const STATUS_DISPLAY: Record<FeedbackStatus, { label: string; variant: "default" | "amber" | "teal" | "muted" }> = {
  OPEN: { label: "open", variant: "default" },
  IN_PROGRESS: { label: "in progress", variant: "amber" },
  RESOLVED: { label: "resolved", variant: "teal" },
  CLOSED: { label: "closed", variant: "muted" },
};

interface StatusSelectProps {
  status: FeedbackStatus;
  /** Fired when the admin picks a new status. Resolve to persist; reject to abort. */
  onStatusChange: (status: FeedbackStatus) => Promise<void>;
  /**
   * Soft-delete the row. Optional — wired by the admin dashboard. Rendered as
   * a separated, danger-styled option below the status list with a confirm
   * dialog (destructive, even though the row stays in the DB).
   */
  onDelete?: () => Promise<void>;
}

/**
 * Inline feedback-status picker for the admin dashboard's recent-feedback table.
 * A chip trigger opens a small absolute-positioned list of the 4 statuses.
 * While a save is in flight, the trigger is disabled (per-row, calm — no global
 * "saving" UI). Outside-click + Escape close without changing.
 *
 * Admin-only by construction: the table that renders this only mounts for
 * admins, and the backing action gates on `context.user.isAdmin`.
 */
export function StatusSelect({ status, onStatusChange, onDelete }: StatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on Escape (backdrop handles outside-click).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function choose(next: FeedbackStatus) {
    if (next === status || saving) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setOpen(false);
    try {
      await onStatusChange(next);
    } finally {
      setSaving(false);
    }
  }

  // Soft-delete: close the dropdown, open the confirm, then run. Same saving
  // guard as choose() so the row can't be double-acted on mid-flight.
  async function requestDelete() {
    if (saving) return;
    setOpen(false);
    setConfirmDelete(true);
  }
  async function confirmDeleteAction() {
    setSaving(true);
    setConfirmDelete(false);
    try {
      await onDelete?.();
    } finally {
      setSaving(false);
    }
  }

  const display = STATUS_DISPLAY[status];

  return (
    <div className="aa-status-select" ref={rootRef}>
      <Chip
        variant={display.variant}
        small
        onClick={saving ? undefined : () => setOpen((o) => !o)}
        className={`aa-status-select__trigger ${saving ? "aa-status-select__trigger--saving" : ""}`}
      >
        {display.label}
        <svg
          className="aa-status-select__caret"
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Chip>

      {open && (
        <>
          <div className="aa-status-select__backdrop" onClick={() => setOpen(false)} />
          <ul className="aa-status-select__panel" role="listbox" aria-label="Feedback status">
            {FEEDBACK_STATUSES.map((s) => {
              const d = STATUS_DISPLAY[s];
              const current = s === status;
              return (
                <li key={s} role="option" aria-selected={current}>
                  <button
                    type="button"
                    className={`aa-status-select__option aa-chip--${d.variant} ${current ? "aa-status-select__option--current" : ""}`}
                    onClick={() => void choose(s)}
                    disabled={saving}
                  >
                    <span className="aa-status-select__option-label">{d.label}</span>
                    {current && (
                      <svg className="aa-status-select__check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
            {onDelete && (
              <>
                <li className="aa-status-select__divider" role="separator" />
                <li>
                  <button
                    type="button"
                    className="aa-status-select__option aa-status-select__option--danger"
                    onClick={() => void requestDelete()}
                    disabled={saving}
                  >
                    <span className="aa-status-select__option-label">Delete</span>
                  </button>
                </li>
              </>
            )}
          </ul>
        </>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete feedback?"
          message="This hides the row from the admin dashboard and CLI. The record stays in the database (soft-delete) but won't appear in any triage view."
          confirmLabel="Delete"
          danger
          onConfirm={() => void confirmDeleteAction()}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
