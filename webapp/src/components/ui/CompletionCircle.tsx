import "./CompletionCircle.css";

interface CompletionCircleProps {
  filled?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * The signature completion circle — empty border → filled teal + check.
 * sm = 20px (lists), md = 32px (hero cards), lg = 44px (empty states).
 */
export function CompletionCircle({
  filled = false,
  size = "sm",
  disabled = false,
  onClick,
  className = "",
}: CompletionCircleProps) {
  return (
    <button
      type="button"
      className={[
        "aa-cc",
        `aa-cc--${size}`,
        filled ? "aa-cc--filled" : "",
        disabled ? "aa-cc--disabled" : "",
        className,
      ].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={filled ? "Completed" : "Mark complete"}
      aria-pressed={filled}
    >
      <svg className="aa-cc__check" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
