import type { ReactNode } from "react";
import "./GroupedList.css";

export interface GroupDef<T> {
  /** The group key (used for React keys) */
  key: string;
  /** The group heading label */
  label: string;
  /** Items in this group */
  items: T[];
}

interface GroupedListProps<T> {
  groups: GroupDef<T>[];
  /** Render each item as a row */
  renderItem: (item: T) => ReactNode;
  /** Render when a group has zero items (e.g. "No overdue") */
  renderEmptyGroup?: (group: GroupDef<T>) => ReactNode;
  /** Show the group heading even if empty */
  keepEmptyGroups?: boolean;
  className?: string;
}

/**
 * GroupedList — sections of rows, each with an eyebrow heading + optional count.
 *
 * Shared layout for Today (grouped by Goal), Upcoming (by date), Projects (by
 * Goal), Logbook (by completion day). The parent computes the groups; this
 * component just renders them with consistent spacing.
 */
export function GroupedList<T>({
  groups,
  renderItem,
  renderEmptyGroup,
  keepEmptyGroups = false,
  className = "",
}: GroupedListProps<T>) {
  return (
    <div className={["aa-grouped", className].filter(Boolean).join(" ")}>
      {groups.map((group) => {
        if (group.items.length === 0 && !keepEmptyGroups) return null;
        return (
          <section key={group.key} className="aa-grouped__group">
            <h3 className="aa-grouped__heading">
              {group.label}
              {group.items.length > 0 && (
                <span className="aa-grouped__count">{group.items.length}</span>
              )}
            </h3>
            <ul className="aa-grouped__list">
              {group.items.length === 0 && renderEmptyGroup ? (
                <li className="aa-grouped__empty">{renderEmptyGroup(group)}</li>
              ) : (
                group.items.map((item, i) => (
                  <li key={i} className="aa-grouped__item">
                    {renderItem(item)}
                  </li>
                ))
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
