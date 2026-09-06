import type { ReactNode } from "react";

/**
 * Empty-state shell — the same calm pattern as Inbox/Next empty states.
 */
export function ListEmpty({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="aa-list-empty">
      {icon && <div className="aa-list-empty__icon">{icon}</div>}
      <h2 className="aa-list-empty__title">{title}</h2>
      <p className="aa-list-empty__text">{text}</p>
      {action && <div className="aa-list-empty__action">{action}</div>}
    </div>
  );
}
