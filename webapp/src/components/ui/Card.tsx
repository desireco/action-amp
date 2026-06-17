import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

type CardVariant = "default" | "elevated" | "interactive" | "highlighted";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Visual style */
  variant?: CardVariant;
  /** Built-in padding sizes, or false for no padding */
  padding?: "none" | "sm" | "md" | "lg";
  /** Optional header element */
  header?: ReactNode;
  children: ReactNode;
}

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "",
  elevated: "aa-card--elevated",
  interactive: "aa-card--interactive",
  highlighted: "aa-card--highlighted",
};

const PADDING_CLASS: Record<string, string> = {
  none: "aa-card--pad-none",
  sm: "aa-card--pad-sm",
  md: "aa-card--pad-md",
  lg: "aa-card--pad-lg",
};

/**
 * Card — surface card with optional elevation, interactivity, padding, and header.
 */
export function Card({
  variant = "default",
  padding = "md",
  header,
  children,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "aa-card",
        VARIANT_CLASS[variant],
        PADDING_CLASS[padding],
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {header && <div className="aa-card__header">{header}</div>}
      {children}
    </div>
  );
}
