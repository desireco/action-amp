import type { ReactNode } from "react";
import "./EntityCardGrid.css";

interface EntityCardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * EntityCardGrid — responsive grid for entity summary cards such as Goals and
 * Projects. The cards own their content; the grid owns rhythm and wrapping.
 */
export function EntityCardGrid({ children, className = "" }: EntityCardGridProps) {
  return (
    <div className={["aa-entity-card-grid", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
