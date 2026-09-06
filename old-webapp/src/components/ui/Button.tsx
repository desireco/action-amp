import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button element ref (React 19 passes ref as a regular prop) */
  ref?: Ref<HTMLButtonElement>;
  /** Visual style */
  variant?: ButtonVariant;
  /** Preset size */
  size?: ButtonSize;
  /** Leading or trailing icon */
  icon?: ReactNode;
  /** Place icon after the label instead of before */
  iconEnd?: boolean;
  /** Monospace kbd hint rendered after the label (or before if iconEnd) */
  kbd?: string;
  /** Render only the button content without outer padding (for embedding in other components) */
  bare?: boolean;
}

const VARIANT_MAP = {
  primary: "aa-btn--primary",
  secondary: "aa-btn--secondary",
  ghost: "aa-btn--ghost",
  danger: "aa-btn--danger",
} satisfies Record<ButtonVariant, string>;

const SIZE_MAP = {
  sm: "aa-btn--sm",
  md: "",
  lg: "aa-btn--lg",
} satisfies Record<ButtonSize, string>;

/**
 * Button — the primary interactive element.
 *
 * Variants: primary (teal CTA), secondary (surface + border), ghost (text), danger (rose).
 * Sizes: sm, md (default), lg.
 * Supports icon (leading by default, trailing with iconEnd), kbd hints, bare mode.
 */
export function Button({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconEnd = false,
  kbd,
  bare = false,
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        bare ? "aa-btn--bare" : "aa-btn",
        bare ? "" : VARIANT_MAP[variant],
        bare ? "" : SIZE_MAP[size],
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {icon && !iconEnd && <span className="aa-btn__icon">{icon}</span>}
      {children && <span className="aa-btn__label">{children}</span>}
      {kbd && <kbd className="aa-btn__kbd">{kbd}</kbd>}
      {icon && iconEnd && <span className="aa-btn__icon">{icon}</span>}
    </button>
  );
}
