import { useMemo } from "react";
import { useQuery } from "wasp/client/operations";
import { getLogbook, restoreArchivedItem } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { BrandMark, Chip, GroupedList, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import "./LogbookPage.css";

interface LogItem {
  id: string;
  title: string;
  when: Date; // completedAt for tasks/projects, archivedAt for archived notes
  kind: "task" | "project" | "archived";
  size?: string;
  project?: { id: string; name: string } | null;
  goal?: { id: string; name: string } | null;
}

/**
 * Logbook — the record of things no longer active, grouped by day.
 * Three categories share this view: completed tasks, completed projects, and
 * archived notes ("I will not do now"). Archived rows carry a Restore action
 * that returns the note to the inbox for re-triage.
 */
export function LogbookPage() {
  const lens = useActiveLens();
  const queryClient = useQueryClient();
  const { data: logbook, isLoading } = useQuery(
    getLogbook,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  const groups = useMemo<GroupDef<LogItem>[]>(() => {
    if (!logbook) return [];
    const all: LogItem[] = [
      ...logbook.tasks.map((t) => ({ ...t, when: new Date(t.completedAt) })),
      ...logbook.projects.map((p) => ({ ...p, when: new Date(p.completedAt) })),
      ...logbook.archived.map((a) => ({ ...a, when: new Date(a.archivedAt) })),
    ].sort((a, b) => b.when.getTime() - a.when.getTime());

    const byDay = new Map<string, LogItem[]>();
    for (const item of all) {
      const key = dayLabel(item.when);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(item);
    }
    return Array.from(byDay, ([label, items]) => ({ key: label, label, items }));
  }, [logbook]);

  if (!isLoading && groups.length === 0) {
    return (
      <ListEmpty
        icon={<span className="aa-logbook-empty-mark"><BrandMark size="md" /></span>}
        title="Nothing here yet."
        text="Completed work and archived notes land here — a calm record, not a guilt trip. Check off a task or archive a note and it'll show up."
      />
    );
  }

  async function handleRestore(id: string) {
    await restoreArchivedItem({ inboxItemId: id });
    // The archived note returns to the inbox; refresh both views.
    queryClient.invalidateQueries({ queryKey: ["getLogbook"] });
    queryClient.invalidateQueries({ queryKey: ["getInboxItems"] });
    queryClient.invalidateQueries({ queryKey: ["getAppData"] });
  }

  return (
    <div className="aa-logbook">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Logbook</div>
          <h1 className="aa-list-header__title">Done &amp; archived</h1>
        </div>
      </header>
      <GroupedList
        groups={groups}
        renderItem={(item) => (
          <div className="aa-logbook-row">
            <span className="aa-logbook-row__check" aria-hidden="true">
              {item.kind === "archived" ? <ArchiveMark /> : <BrandMark size="sm" />}
            </span>
            <div className="aa-logbook-row__main">
              <span className="aa-logbook-row__title">{item.title}</span>
              <div className="aa-logbook-row__meta">
                {item.kind === "project" ? (
                  <Chip variant="violet" small>Project</Chip>
                ) : item.kind === "archived" ? (
                  <Chip variant="muted" small>Archived</Chip>
                ) : (
                  item.project && <Chip variant="violet" small>{item.project.name}</Chip>
                )}
                {item.goal && <Chip variant="teal" small>{item.goal.name}</Chip>}
              </div>
            </div>
            {item.kind === "archived" && (
              <button
                type="button"
                className="aa-logbook-row__restore"
                onClick={() => void handleRestore(item.id)}
                title="Send back to the inbox"
              >
                Restore
              </button>
            )}
          </div>
        )}
      />
    </div>
  );
}

/** A muted box icon for archived notes — distinct from the BrandMark check. */
function ArchiveMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 6v7a1 1 0 001 1h8a1 1 0 001-1V6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 9h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
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
