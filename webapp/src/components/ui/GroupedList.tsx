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
  /** Heading level for the group label. Defaults to 3. Use 2 when the list is
   * a top-level section peer (e.g. Today's open list sits beside "Done today"
   * and "Beyond the cap" as h2). Nested lists under an h2 section keep 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Per-group class. Receives the group label; return a class name to mark a
   * specific group (e.g. tint the "Overdue" bucket). */
  groupClassName?: (label: string) => string | undefined;
  className?: string;
}

/**
 * GroupedList — sections of rows, each with an eyebrow heading + optional count.
 *
 * Shared layout for Today (grouped by Goal), Upcoming (by date), Projects (by
 * Goal), Logbook (by completion day). The parent computes the groups; this
 * component just renders them with consistent spacing.
 *
 * A group with an empty-string `label` renders its rows without a heading —
 * used when a list has a single default group (e.g. Today's "General" when no
 * task carries an explicit Goal) and the heading would carry no information.
 */
export function GroupedList<T>({
  groups,
  renderItem,
  renderEmptyGroup,
  keepEmptyGroups = false,
  headingLevel = 3,
  groupClassName,
  className = "",
}: GroupedListProps<T>) {
  const Heading = (`h${headingLevel}` as unknown) as "h3";
  return (
    <div className={["aa-grouped", className].filter(Boolean).join(" ")}>
      {groups.map((group) => {
        if (group.items.length === 0 && !keepEmptyGroups) return null;
        const extra = groupClassName?.(group.label);
        const showHeading = group.label !== "";
        return (
          <section
            key={group.key}
            className={["aa-grouped__group", extra].filter(Boolean).join(" ")}
          >
            {showHeading && (
              <Heading className="aa-grouped__heading">
                {group.label}
                {group.items.length > 0 && (
                  <span className="aa-grouped__count">{group.items.length}</span>
                )}
              </Heading>
            )}
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
