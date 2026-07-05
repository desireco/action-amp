import { Button } from "./Button";
import "./DetailHeaderActions.css";

export interface DetailHeaderAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}

interface DetailHeaderActionsProps {
  actions: DetailHeaderAction[];
}

/**
 * DetailHeaderActions — compact action tray for task/project/goal detail pages.
 */
export function DetailHeaderActions({ actions }: DetailHeaderActionsProps) {
  return (
    <div className="aa-detail-actions">
      {actions.map((action) => (
        <Button
          key={action.label}
          className={`aa-detail-action ${action.danger ? "aa-detail-action--danger" : ""}`}
          variant="ghost"
          size="sm"
          onClick={action.onClick}
          title={action.title}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
