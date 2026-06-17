import { useMemo } from "react";
import { useQuery } from "wasp/client/operations";
import { getLogbook } from "wasp/client/operations";
import { BrandMark, Chip, GroupedList, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import "./LogbookPage.css";

interface LogItem {
  id: string;
  title: string;
  completedAt: Date;
  kind: "task" | "project";
  size?: string;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
}

/**
 * Logbook — completed tasks + projects, read-only, grouped by completion day.
 * The calm archive. Restore/permanent-delete land in a later refinement.
 */
export function LogbookPage() {
  const lens = useActiveLens();
  const { data: logbook, isLoading } = useQuery(
    getLogbook,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  const groups = useMemo<GroupDef<LogItem>[]>(() => {
    if (!logbook) return [];
    const all: LogItem[] = [
      ...logbook.tasks.map((t) => ({ ...t, completedAt: new Date(t.completedAt) })),
      ...logbook.projects.map((p) => ({ ...p, completedAt: new Date(p.completedAt) })),
    ].sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

    const byDay = new Map<string, LogItem[]>();
    for (const item of all) {
      const key = dayLabel(item.completedAt);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }
    return Array.from(byDay, ([label, items]) => ({ key: label, label, items }));
  }, [logbook]);

  if (!isLoading && groups.length === 0) {
    return (
      <ListEmpty
        icon={<span className="aa-logbook-empty-mark"><BrandMark size="md" /></span>}
        title="Nothing completed yet."
        text="Your wins land here. Check off your first task and it'll show up — a calm record, not a guilt trip."
      />
    );
  }

  return (
    <div className="aa-logbook">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Logbook</div>
          <h1 className="aa-list-header__title">Done</h1>
        </div>
      </header>
      <GroupedList
        groups={groups}
        renderItem={(item) => (
          <div className="aa-logbook-row">
            <span className="aa-logbook-row__check" aria-hidden="true">
              <BrandMark size="sm" />
            </span>
            <div className="aa-logbook-row__main">
              <span className="aa-logbook-row__title">{item.title}</span>
              <div className="aa-logbook-row__meta">
                {item.kind === "project" ? (
                  <Chip variant="violet" small>Project</Chip>
                ) : (
                  item.project && <Chip variant="violet" small>{item.project.name}</Chip>
                )}
                {item.goal && <Chip variant="teal" small>{item.goal.name}</Chip>}
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
}

function dayLabel(d: Date): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((now.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return target.toLocaleDateString(undefined, { weekday: "long" });
  return target.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}
