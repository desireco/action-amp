import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useQuery, getTasks } from "wasp/client/operations";
import type { Task } from "@prisma/client";
import {
  TaskRow,
  Button,
  CompletionCircle,
} from "../components/ui";
import { useActiveLens } from "../app/lensContext";
import { ListEmpty } from "./ListShell";
import { useTaskListActions } from "./useTaskListActions";
import "./ListShell.css";
import "./SomedayPage.css";

/**
 * Someday — undated, deprioritized tasks. Flat list, lighter visual weight
 * (muted rows). Each row has a "→ Today" control to promote it back onto the
 * court (reuses updateTaskStatus, same motion as the Today bench promote).
 * No "→ Upcoming" — Upcoming is reached via snooze from Next/Today, not
 * from Someday, so a second destination would muddy the single promote path.
 */
export function SomedayPage() {
  const lens = useActiveLens();
  const navigate = useNavigate();
  const location = useLocation();
  const { promoteToToday } = useTaskListActions();
  const { data: tasks, isLoading } = useQuery(
    getTasks,
    lens ? { lensId: lens.id, status: "SOMEDAY", isDone: false } : undefined,
    { enabled: !!lens },
  );

  const count = tasks?.length ?? 0;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  // Active row for the click-to-reveal action drawer. Null = no row open.
  // Mirrors UpcomingPage/TodayPage. Without this, Someday rows would have no
  // way to expose their promote control on hover-less devices; with it, the
  // list reads as a list and a row becomes a deliberate drawer you open.
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  return (
    <div className="aa-someday">
      <header className="aa-list-header">
        <div>
          <div className="aa-list-header__eyebrow">Planning</div>
          <h1 className="aa-list-header__title">Someday</h1>
          <p className="aa-list-header__description">
            {isLoading
              ? "Loading parked tasks…"
              : `${count} parked · Kept without asking for attention today.`}
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="aa-someday__loading" aria-label="Loading Someday tasks">
          <div className="aa-list-skeleton-group" aria-hidden="true">
            <div className="aa-list-skeleton aa-list-skeleton--heading" />
            <div className="aa-list-skeleton aa-list-skeleton--row" />
            <div className="aa-list-skeleton aa-list-skeleton--row" />
          </div>
        </div>
      ) : count === 0 ? (
        <ListEmpty
          icon={<CompletionCircle size="md" />}
          title="Nothing parked."
          text="Someday is for things you want to keep but stop nagging about. Send a task here from triage or by changing its status."
        />
      ) : (
        <ul className="aa-someday-list">
          {(tasks ?? []).map((task: Task) => (
            <li
              key={task.id}
              className={`aa-someday-row${activeTaskId === task.id ? " aa-someday-row--active" : ""}`}
            >
              <TaskRow
                as="div"
                task={task}
                muted
                expanded={activeTaskId === task.id}
                onOpen={() =>
                  setActiveTaskId((current) =>
                    current === task.id ? null : task.id,
                  )
                }
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveTaskId(null);
                    void promoteToToday(task);
                  }}
                  title="Move to Today"
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(`/do/tasks/${task.permalink ?? task.id}`, {
                      state: { returnTo },
                    })
                  }
                  title="Open task"
                >
                  Open
                </Button>
              </TaskRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
