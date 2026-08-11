import { useEffect, useRef, useState } from "react";
import type { LensSwitchOption } from "./LensSwitch";
import "./LensPopover.css";

/**
 * LensPopover — the ≥4-lenses switcher (chip + popover).
 *
 * At ≤3 lenses AppShell renders <LensSwitch> (segmented control). At ≥4 that
 * control gets crowded, so the sidebar shows a single compact chip (active
 * color + name + ⌘L hint) that opens this popover listing every lens with its
 * purpose. ⌘L toggles it (wired in AppShell).
 *
 * Keyboard (per INTERACTION.md popover conventions):
 *   ↑↓  move the highlight
 *   ↵   select the highlighted lens
 *   /   focus the inline filter
 *   esc close (handled by the parent's onCloseOverlay → onClose prop)
 *
 * FREE users cap at the seeded two, so this ≥4 branch is Pro-only in practice.
 * A `proLocked` option still renders its chip; selecting it calls onSelect and
 * the parent's setLens runs the FREE gate. The "+ New lens" row (onNewLens, if
 * provided) opens the Settings Lenses tab.
 *
 * Anchored: positioned absolutely under the chip via .aa-lens-popover__anchor.
 * Outside-click closes (the backdrop stops propagation on the popover body).
 */
export interface LensPopoverOption extends LensSwitchOption {
  /** One short line: what this lens is for. Rendered muted under the name. */
  purpose?: string | null;
}

interface LensPopoverProps {
  options: LensPopoverOption[];
  /** id of the currently-active lens */
  active: string;
  /** Called when a lens is selected (the parent decides FREE gating) */
  onSelect: (id: string) => void;
  /** Called when the popover should close (esc / outside-click / select) */
  onClose: () => void;
  /** "+ New lens…" affordance; omitted = don't render the row */
  onNewLens?: () => void;
  /** Whether the "+ New lens" row should show a Pro tag (FREE user) */
  newLensProLocked?: boolean;
  /** Accessible label for the chip */
  ariaLabel?: string;
}

export function LensPopover({
  options,
  active,
  onSelect,
  onClose,
  onNewLens: _onNewLens,
  newLensProLocked: _newLensProLocked = false,
  ariaLabel = "Lens",
}: LensPopoverProps) {
  const [highlight, setHighlight] = useState(() =>
    Math.max(0, options.findIndex((o) => o.id === active)),
  );
  const [filter, setFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  // The popover opens from a button, so move keyboard focus into its list.
  // This makes Arrow keys and Enter immediately operate on lens options.
  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const filtered = filter
    ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options;

  // Clamp highlight when the filter shrinks the list.
  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Scroll the highlighted row into view on move.
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlight}"]`,
    );
    // `scrollIntoView` is absent in jsdom (test env); guard for it.
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [highlight]);

  function choose(idx: number) {
    const opt = filtered[idx];
    if (!opt) return;
    onSelect(opt.id);
    onClose();
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(highlight);
    } else if (e.key === "/") {
      e.preventDefault();
      setFilterOpen(true);
    }
  }

  // Focus the filter input when filter mode opens. In an effect so the input
  // is mounted by the render before we focus (a direct call in onListKeyDown
  // races the conditional render; an effect runs after commit, safely).
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);

  return (
    <div className="aa-lens-popover">
      {/* Backdrop: clicks outside the popover close it. Transparent so the
          sidebar stays visible; the popover sits above via z-index. */}
      <div className="aa-lens-popover__backdrop" onClick={onClose} />
      <div
        className="aa-lens-popover__panel"
        role="dialog"
        aria-label={`Switch ${ariaLabel}`}
      >
        <div className="aa-lens-popover__head">
          <span>Switch lens</span>
          <kbd className="aa-lens-popover__kbd">⌘L</kbd>
        </div>
        {(filterOpen || filter) && (
          <div className="aa-lens-popover__filter">
            <input
              ref={filterRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter lenses…"
              aria-label="Filter lenses"
              onBlur={() => {
                if (!filter) setFilterOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setFilter("");
                  setFilterOpen(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        )}
        <div
          ref={listRef}
          className="aa-lens-popover__list"
          role="listbox"
          aria-label="Lenses"
          tabIndex={0}
          onKeyDown={onListKeyDown}
        >
          {filtered.length === 0 && (
            <div className="aa-lens-popover__empty">No lenses match.</div>
          )}
          {filtered.map((opt, i) => {
            const isActive = opt.id === active;
            return (
              <button
                key={opt.id}
                type="button"
                data-idx={i}
                role="option"
                aria-selected={isActive}
                data-lens-color={opt.color || undefined}
                className={[
                  "aa-lens-popover__opt",
                  isActive ? "is-active" : "",
                  i === highlight ? "is-highlight" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(i)}
              >
                <span className="aa-lens-popover__dot" aria-hidden="true" />
                <span className="aa-lens-popover__main">
                  <span className="aa-lens-popover__name">{opt.label}</span>
                  {opt.purpose && (
                    <span className="aa-lens-popover__purpose">{opt.purpose}</span>
                  )}
                </span>
                {opt.proLocked && (
                  <span className="aa-lens-popover__pro" title="Pro feature">Pro</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * LensChip — the compact always-visible trigger for the popover. Renders the
 * active lens's color dot + name + ⌘L hint + caret. Sits in the sidebar footer
 * where <LensSwitch> would at ≤3 lenses. Clicking calls onOpen.
 */
export function LensChip({
  label,
  color,
  onClick,
  ariaLabel = "Lens",
  open = false,
}: {
  label: string;
  color?: string | null;
  onClick: () => void;
  ariaLabel?: string;
  open?: boolean;
}) {
  return (
    <button
      type="button"
      className={`aa-lens-chip ${open ? "is-open" : ""}`}
      data-lens-color={color || undefined}
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`${ariaLabel}: ${label}`}
    >
      <span className="aa-lens-chip__dot" aria-hidden="true" />
      <span className="aa-lens-chip__name">{label}</span>
      <kbd className="aa-lens-chip__kbd">⌘L</kbd>
      <span className="aa-lens-chip__caret" aria-hidden="true">▾</span>
    </button>
  );
}
