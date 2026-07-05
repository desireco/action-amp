import type { ReactNode } from "react";
import "./RecordCardGrid.css";

interface RecordCardGridProps {
  children: ReactNode;
  className?: string;
}

/**
 * RecordCardGrid — responsive grid for record summary cards such as Goals and
 * Projects. The cards own their content; the grid owns rhythm and wrapping.
 */
export function RecordCardGrid({ children, className = "" }: RecordCardGridProps) {
  return (
    <div className={["aa-record-card-grid", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
