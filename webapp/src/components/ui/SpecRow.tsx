import "./SpecRow.css";

export interface SpecOption {
  value: string;
  label: string;
  hint?: string | null;
}

interface SpecRowProps {
  label: string;
  value: string;
  options: SpecOption[];
  onPick: (value: string) => void;
  onToggle: () => void;
  open: boolean;
  isDefault?: boolean;
  isProject?: boolean;
}

/**
 * SpecRow — compact property row with inline choices or picker-backed behavior.
 *
 * Used by triage to make item properties explicit without opening a full form.
 * Empty `options` means the row delegates to an external picker via `onPick`.
 */
export function SpecRow({
  label,
  value,
  options,
  onPick,
  onToggle,
  open,
  isDefault,
  isProject,
}: SpecRowProps) {
  const valClass = `v-${value.replace(/\s/g, "")}`;
  const rowCls = [
    "aa-spec-row",
    valClass,
    isProject ? "is-project" : "",
    isDefault ? "is-default" : "",
    open ? "open" : "",
  ].filter(Boolean).join(" ");

  const pickerBacked = options.length === 0;

  return (
    <>
      <button
        type="button"
        className={rowCls}
        onClick={() => (pickerBacked ? onPick("") : onToggle())}
      >
        <span className="aa-spec-key">{label}</span>
        <span className="aa-spec-val">{value}</span>
        <svg className="aa-spec-chev" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && !pickerBacked && (
        <div className="aa-spec-options">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`aa-spec-opt ${option.label === value ? "active" : ""}`}
              onClick={() => onPick(option.value)}
            >
              <span>
                {option.label}
                {option.hint && <span className="aa-spec-opt-hint">{option.hint}</span>}
              </span>
              <svg className="opt-check" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
