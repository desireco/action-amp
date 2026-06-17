import type { SVGAttributes } from "react";

/**
 * BrandMark — the teal checkmark icon used everywhere.
 *
 * Three sizes: sm (12px viewBox), md (15px, default), lg (20px).
 * Accepts all native SVG attributes for full control (className, style, aria-*).
 */
export function BrandMark({
  size = "md",
  className = "",
  ...rest
}: { size?: "sm" | "md" | "lg" } & SVGAttributes<SVGSVGElement>) {
  const sizeMap = { sm: 12, md: 15, lg: 20 } as const;
  const dim = sizeMap[size];
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 16 16"
      fill="none"
      className={`aa-brand-mark ${className}`}
      aria-hidden="true"
      {...rest}
    >
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
