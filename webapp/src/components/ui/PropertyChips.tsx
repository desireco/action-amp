import { useEffect, useRef, useState, type ReactNode } from "react";
import { PickerSheet } from "./PickerSheet";
import { ChevronIcon } from "./icons";
import "./PropertyChips.css";

/* ------------------------------------------------------------------
 * PropertyChips — the app's one property editor.
 *
 * A row of chips, one per property. Each chip IS the editor: click → a small
 * popover opens anchored to that chip with just that property's options;
 * pick → fires onChange. Picker-backed fields (project/goal/parent) open a
 * bottom sheet, since those lists are data-driven and unbounded.
 *
 * Config-driven: the caller composes a `fields[]` describing which properties
 * to show, their variants (color), option lists, and current values. This is
 * the same component on the task page and in triage — one editor, one mental
 * model, one keyboard scheme (see usePropertyKeys).
 *
 * Unset fields render as a quiet "+ Label" dashed chip (clickable to set).
 * `readOnly` (done tasks) renders static pills with no editors.
 * ------------------------------------------------------------------ */

export type PropertyVariant =
  | "when"
  | "today"
  | "important"
  | "normal"
  | "size"
  | "project"
  | "goal"
  | "due"
  | "kind"
  | "parent";

export interface PropertyOption {
  value: string;
  label: string;
  hint?: string | null;
}

export interface PropertyPickerItem {
  id: string;
  label: string;
  meta?: string | null;
}

export interface PropertyField {
  /** Stable key — identifies the field in onChange/onPickerPick. */
  key: string;
  /** Color variant (controls chip tint by meaning). */
  variant: PropertyVariant;
  /** Chip label when set, e.g. "Today" / "Important". */
  displayValue: string;
  /** Internal value (compared against option.value / pickerItem.id). */
  value: string | null;
  /** Inline-popover options. Empty array (or omitted) = picker-backed. */
  options?: PropertyOption[];
  /** When set, the chip opens a PickerSheet instead of an inline popover.
   *  The sheet is rendered by PropertyChips using this config. */
  picker?: {
    title: string;
    items: PropertyPickerItem[];
    /** Show a "No <field>" / "None" row at the top that picks `null`. */
    allowNone?: boolean;
    noneLabel?: string;
    emptyMessage?: string;
  };
  /** When true + `picker` omitted: chip click fires `onPickerOpen(key)` and
   *  the CALLER renders the bottom sheet. Used by triage, whose pickers have
   *  rich semantics (custom titles, switch-project↔goal action rows) that
   *  don't fit PropertyChips' built-in sheet. */
  externalPicker?: boolean;
  /** Render as a quiet "+ Label" affordance (no value set yet). */
  unset?: boolean;
  /** Visible label for the + affordance, e.g. "Due" → "+ Due". */
  addLabel?: string;
}

interface PropertyChipsProps {
  fields: PropertyField[];
  readOnly?: boolean;
  /** Inline option pick. */
  onPick: (fieldKey: string, value: string) => void;
  /** Picker pick (value is the item id, or null when "None" is chosen). Only
   *  called for fields with a built-in `picker` config (not externalPicker). */
  onPickerPick?: (fieldKey: string, value: string | null) => void;
  /** Fired when an `externalPicker` field's chip is clicked — the caller opens
   *  its own bottom sheet. */
  onPickerOpen?: (fieldKey: string) => void;
  /** Notifies the parent when a popover/sheet opens or closes — so the parent
   *  can disable property-key shortcuts while a picker is open. */
  onOpenChange?: (open: boolean) => void;
}

export function PropertyChips({
  fields,
  readOnly = false,
  onPick,
  onPickerPick,
  onPickerOpen,
  onOpenChange,
}: PropertyChipsProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Sheet target is the field key of the picker-backed chip currently open.
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Tell the parent whenever a popover or sheet is open — they use it to gate
  // the property-key shortcuts (don't fire [ / ] / - / = / H while picking).
  const anyOpen = openKey !== null || sheetKey !== null;
  useEffect(() => {
    onOpenChange?.(anyOpen);
  }, [anyOpen, onOpenChange]);

  // Outside-click + Escape close the inline popover.
  useEffect(() => {
    if (!openKey || readOnly) return;
    const onPointer = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenKey(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKey, readOnly]);

  if (readOnly) {
    return (
      <div className="aa-prop-chips aa-prop-chips--static" ref={rowRef}>
        {fields.map((f) => (
          <span
            key={f.key}
            className={`aa-prop-chip aa-prop-chip--${f.variant} aa-prop-chip--static`}
          >
            {f.displayValue}
          </span>
        ))}
      </div>
    );
  }

  const toggle = (key: string) =>
    setOpenKey((cur) => (cur === key ? null : key));

  return (
    <>
      <div className="aa-prop-chips" ref={rowRef}>
        {fields.map((f) => {
          // External picker — caller renders its own sheet. Chip click just
          // signals the page to open it.
          if (f.externalPicker) {
            return (
              <span className="aa-prop-chip-slot" key={f.key}>
                <button
                  type="button"
                  className={[
                    "aa-prop-chip",
                    `aa-prop-chip--${f.variant}`,
                    f.unset ? "aa-prop-chip--add" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPickerOpen?.(f.key);
                  }}
                >
                  {f.unset ? `+ ${f.addLabel ?? f.displayValue}` : f.displayValue}
                  {!f.unset && <ChevronIcon className="aa-prop-chip-chev" />}
                </button>
              </span>
            );
          }

          // Built-in picker field → opens PropertyChips' own PickerSheet.
          if (f.picker) {
            return (
              <span className="aa-prop-chip-slot" key={f.key}>
                <button
                  type="button"
                  className={[
                    "aa-prop-chip",
                    `aa-prop-chip--${f.variant}`,
                    sheetKey === f.key ? "is-open" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-expanded={sheetKey === f.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheetKey(f.key);
                  }}
                >
                  {f.unset ? `+ ${f.addLabel ?? f.displayValue}` : f.displayValue}
                  {!f.unset && <ChevronIcon className="aa-prop-chip-chev" />}
                </button>
              </span>
            );
          }

          // Inline-popover field.
          return (
            <span className="aa-prop-chip-slot" key={f.key}>
              <button
                type="button"
                className={[
                  "aa-prop-chip",
                  `aa-prop-chip--${f.variant}`,
                  f.unset ? "aa-prop-chip--add" : "",
                  openKey === f.key ? "is-open" : "",
                ]
                    .filter(Boolean)
                    .join(" ")}
                aria-expanded={openKey === f.key}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(f.key);
                }}
              >
                {f.unset ? `+ ${f.addLabel ?? f.displayValue}` : f.displayValue}
                {!f.unset && <ChevronIcon className="aa-prop-chip-chev" />}
              </button>
              {openKey === f.key && !f.unset && (
                <Popover title={f.displayValue}>
                  {(f.options ?? []).map((opt) => (
                    <PopoverOption
                      key={opt.value}
                      active={f.value === opt.value}
                      onClick={() => {
                        onPick(f.key, opt.value);
                        setOpenKey(null);
                      }}
                    >
                      {opt.label}
                      {opt.hint && <PopoverHint>{opt.hint}</PopoverHint>}
                    </PopoverOption>
                  ))}
                </Popover>
              )}
              {/* The "+ Due" affordance: opens with the full list (no "none"
                  row — the field is currently unset; the user wants to set it). */}
              {openKey === f.key && f.unset && (
                <Popover title={f.addLabel ?? f.displayValue}>
                  {(f.options ?? []).map((opt) => (
                    <PopoverOption
                      key={opt.value}
                      active={false}
                      onClick={() => {
                        onPick(f.key, opt.value);
                        setOpenKey(null);
                      }}
                    >
                      {opt.label}
                      {opt.hint && <PopoverHint>{opt.hint}</PopoverHint>}
                    </PopoverOption>
                  ))}
                </Popover>
              )}
            </span>
          );
        })}
      </div>

      {/* Bottom-sheet pickers for picker-backed fields. Rendered when its key
          is the active sheetKey. */}
      {fields
        .filter((f) => f.picker && sheetKey === f.key)
        .map((f) => (
          <PickerSheet
            key={f.key}
            title={f.picker!.title}
            emptyMessage={f.picker!.emptyMessage}
            items={[
              ...(f.picker!.allowNone
                ? [
                    {
                      id: "__none__",
                      label: f.picker!.noneLabel ?? "None",
                      current: !f.value,
                    },
                  ]
                : []),
              ...f.picker!.items.map((item) => ({
                id: item.id,
                label: item.label,
                meta: item.meta,
                current: f.value === item.id,
              })),
            ]}
            onPick={(id) => {
              const none =
                f.picker!.allowNone && id === "__none__" ? null : id;
              onPickerPick?.(f.key, none);
              setSheetKey(null);
            }}
            onClose={() => setSheetKey(null)}
          />
        ))}
    </>
  );
}

/* ---- Sub-components (file-local) ---- */

function Popover({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="aa-prop-chip-popover"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="aa-prop-chip-popover__title">{title}</div>
      {children}
    </div>
  );
}

function PopoverOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`aa-prop-chip-opt ${active ? "active" : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      <svg
        className="aa-prop-chip-check"
        width="14"
        height="14"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function PopoverHint({ children }: { children: ReactNode }) {
  return <span className="aa-prop-chip-opt-hint">{children}</span>;
}
