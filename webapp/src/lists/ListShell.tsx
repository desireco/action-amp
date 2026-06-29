import type { ReactNode } from "react";

/**
 * Shared page header for the list views. Eyebrow + title + optional actions.
 */
export function ListHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="aa-list-header">
      <div>
        <div className="aa-list-header__eyebrow">{eyebrow}</div>
        <h1 className="aa-list-header__title">{title}</h1>
      </div>
      {actions && <div className="aa-list-header__actions">{actions}</div>}
    </header>
  );
}

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
