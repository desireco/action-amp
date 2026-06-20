import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "wasp/client/operations";
import { getProjects, createProject } from "wasp/client/operations";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Chip, GroupedList, type GroupDef } from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "../lists/ListShell";
import { CreateInline } from "../lists/CreateInline";
import "./ProjectsPage.css";
import "../lists/CreateInline.css";

interface ProjectRow {
  id: string;
  name: string;
  dueDate: Date | string | null;
  goal: { id: string; name: string } | null;
  openCount: number;
  doneCount: number;
  nextAction: { id: string; description: string; priority: string; size: string } | null;
}

/**
 * Projects — grouped by Goal (or "Standalone"). Each row shows progress
 * (X/Y done), due date, and a next-action preview (or a "no next action" badge).
 */
export function ProjectsPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: projects, isLoading } = useQuery(
    getProjects,
    lens ? { lensId: lens.id } : undefined,
    { enabled: !!lens },
  );

  const handleCreate = async (name: string) => {
    if (!lens) return;
    setSubmitting(true);
    try {
      await createProject({ name, lensId: lens.id });
      queryClient.invalidateQueries({ queryKey: ["getProjects"] });
      queryClient.invalidateQueries({ queryKey: ["getAppData"] });
      setCreating(false);
    } catch {
      /* surface elsewhere */
    } finally {
      setSubmitting(false);
    }
  };

  const groups = useMemo<GroupDef<ProjectRow>[]>(() => {
    if (!projects) return [];
    const byGoal = new Map<string, ProjectRow[]>();
    for (const p of projects) {
      const key = p.goal?.name ?? "Standalone";
      if (!byGoal.has(key)) byGoal.set(key, []);
      byGoal.get(key)!.push(p);
    }
    return Array.from(byGoal, ([name, items]) => ({ key: name, label: name, items }));
  }, [projects]);

  if (!isLoading && (projects?.length ?? 0) === 0) {
    return (
      <div className="aa-projects">
        <header className="aa-list-header">
          <div>
            <div className="aa-list-header__eyebrow">Projects</div>
            <h1 className="aa-list-header__title">0 active</h1>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>New project</Button>
        </header>
        {creating && (
          <CreateInline
            placeholder="Project name (e.g. ‘Ship product v2’)"
            onCreate={handleCreate}
            onCancel={() => setCreating(false)}
            submitting={submitting}
          />
        )}
        <ListEmpty
          title="No projects yet."
          text="Projects are outcomes that need more than one step. Create one here, or promote a big task during triage."
        />
      </div>
    );
  }

  return (
    <div className="aa-projects">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Projects</div>
          <h1 className="aa-list-header__title">{projects?.length ?? 0} active</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setCreating((v) => !v)}>
          {creating ? "Cancel" : "New project"}
        </Button>
      </header>
      {creating && (
        <CreateInline
          placeholder="Project name (e.g. ‘Ship product v2’)"
          onCreate={handleCreate}
          onCancel={() => setCreating(false)}
          submitting={submitting}
        />
      )}
      <GroupedList
        groups={groups}
        renderItem={(p) => {
          const total = p.openCount + p.doneCount;
          const pct = total === 0 ? 0 : Math.round((p.doneCount / total) * 100);
          return (
            <button
              type="button"
              className="aa-project-row"
              onClick={() => navigate(`/app/tasks/${p.id}`)}
            >
              <div className="aa-project-row__head">
                <span className="aa-project-row__name">{p.name}</span>
                {p.dueDate && <Chip variant="teal" small>{formatDue(p.dueDate)}</Chip>}
              </div>
              <div className="aa-project-row__progress">
                <div className="aa-project-row__bar">
                  <div className="aa-project-row__fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="aa-project-row__count">
                  {p.doneCount}/{total} done
                </span>
              </div>
              <div className="aa-project-row__next">
                {p.nextAction ? (
                  <span className="aa-project-row__next-action">→ {p.nextAction.description}</span>
                ) : (
                  <Chip variant="muted" small>No next action</Chip>
                )}
              </div>
            </button>
          );
        }}
      />
    </div>
  );
}

function formatDue(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
