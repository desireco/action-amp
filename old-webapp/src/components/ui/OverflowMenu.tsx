import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "./BottomSheet";
import { MoreIcon } from "./icons";
import { useMediaQuery } from "./useMediaQuery";
import "./OverflowMenu.css";

export interface OverflowMenuItem {
  label: string;
  onPick: () => void;
  danger?: boolean;
  title?: string;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Accessible name for the ⋯ trigger and the mobile sheet heading. */
  label?: string;
}

/**
 * OverflowMenu — ⋯ trigger for detail-page action trays.
 *
 * One component, two overlay modes (INTERACTION §9): an anchored popover on
 * desktop, a bottom sheet in the thumb zone on mobile (≤720px). Destructive
 * items render in rose. Picking an item closes the menu first, then runs the
 * action; focus returns to the trigger.
 */
export function OverflowMenu({ items, label = "More actions" }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 720px)");
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const pick = (item: OverflowMenuItem) => {
    close();
    item.onPick();
  };

  // Desktop popover: outside pointer and Esc close. The sheet handles both
  // itself (backdrop + BottomSheet's own Esc listener).
  useEffect(() => {
    if (!open || isMobile) return;
    const onPointer = (e: PointerEvent) => {
      // SAFETY: DOM event target is guaranteed to be this element type in this handler.
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, isMobile]);

  // Keyboard-first: opening the popover lands focus on the first item.
  useEffect(() => {
    if (open && !isMobile) {
      menuRef.current?.querySelector<HTMLElement>(".aa-overflow__item")?.focus();
    }
  }, [open, isMobile]);

  // Arrow keys cycle items; Home/End jump to the ends.
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const itemEls = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(".aa-overflow__item") ?? [],
    );
    if (itemEls.length === 0) return;
    // SAFETY: DOM event target is guaranteed to be this element type in this handler.
    const current = itemEls.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? itemEls.length - 1
          : (current + (e.key === "ArrowDown" ? 1 : -1) + itemEls.length) % itemEls.length;
    itemEls[next].focus();
  };

  return (
    <div className="aa-overflow" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="aa-overflow__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon />
      </button>

      {open && isMobile && (
        <BottomSheet title={label} onClose={() => close()}>
          <ul className="aa-overflow__sheet-list">
            {items.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className={`aa-overflow__item ${item.danger ? "aa-overflow__item--danger" : ""}`}
                  title={item.title}
                  onClick={() => pick(item)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}

      {open && !isMobile && (
        <div className="aa-overflow__menu" role="menu" ref={menuRef} onKeyDown={onMenuKeyDown}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`aa-overflow__item ${item.danger ? "aa-overflow__item--danger" : ""}`}
              title={item.title}
              onClick={() => pick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
