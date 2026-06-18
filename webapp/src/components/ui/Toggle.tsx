import "./Toggle.css";

interface ToggleProps {
  /** Whether the switch is on */
  checked: boolean;
  /** Called when the switch is toggled */
  onChange: (checked: boolean) => void;
  /** Accessible label — required since the toggle has no visible text */
  label: string;
  /** Disable interaction */
  disabled?: boolean;
  className?: string;
}

/**
 * Toggle — a switch for boolean preferences.
 *
 * Teal accent when on, neutral when off. Smooth thumb slide. Used in the
 * Preferences page (theme, sounds, momentum) and anywhere a setting flips.
 */
export function Toggle({ checked, onChange, label, disabled = false, className = "" }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={[
        "aa-toggle",
        checked ? "aa-toggle--on" : "",
        disabled ? "aa-toggle--disabled" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="aa-toggle__thumb" />
    </button>
  );
}
