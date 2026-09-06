import type { ReactNode } from "react";
import { Toggle } from "../components/ui";
import "./Field.css";

/**
 * Field — a label/value row used throughout Settings.
 *
 * Variants:
 *   - value: read-only label + value (email, name)
 *   - toggle: label + description on the left, a Toggle on the right
 *   - custom: label + arbitrary children (number inputs, selects)
 */
interface FieldProps {
  label: string;
  description?: string;
  children?: ReactNode;
  /** For the value variant */
  value?: ReactNode;
  /** For the toggle variant */
  toggle?: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  className?: string;
}

export function Field({ label, description, children, value, toggle, className = "" }: FieldProps) {
  return (
    <div className={["aa-field", className].filter(Boolean).join(" ")}>
      <div className="aa-field__text">
        <span className="aa-field__label">{label}</span>
        {description && <span className="aa-field__desc">{description}</span>}
      </div>
      {toggle && (
        <Toggle
          label={label}
          checked={toggle.checked}
          onChange={toggle.onChange}
          disabled={toggle.disabled}
        />
      )}
      {value !== undefined && <span className="aa-field__value">{value}</span>}
      {children}
    </div>
  );
}
