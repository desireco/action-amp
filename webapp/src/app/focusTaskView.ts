import type { FocusTask } from "../components/ui";

export function sizeLabel(size: string | null | undefined): string {
  if (!size) return "";
  return { S: "15 min", M: "30 min", L: "1 hr", XL: "2 hr+" }[size] ?? size;
}

export function formatWhen(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function toFocusTask(task: {
  id: string;
  description: string;
  content?: string | null;
  outcome?: string | null;
  status: string;
  dueDate?: Date | string | null;
  size?: string | null;
  startedAt?: Date | string | null;
  project?: { name: string } | null;
  user?: { focusSessionMinutes?: number | null } | null;
  updates?: { id: string; body: string; createdAt: Date; kind: string }[];
  sessions?: {
    startedAt: Date | string;
    endedAt?: Date | string | null;
    plannedMinutes?: number | null;
    completed?: boolean;
  }[];
}): FocusTask {
  const due =
    task.status === "TODAY"
      ? "due today"
      : task.dueDate
        ? `due ${formatWhen(task.dueDate)}`
        : null;

  // Focus-segment accounting. Each session row is either closed (endedAt set)
  // or open (endedAt null — at most one). The total includes the open
  // segment's elapsed-so-far so the clock's total ticks alongside the live
  // session number.
  const sessions = (task.sessions ?? []).map((s) => ({
    startedAt: new Date(s.startedAt),
    endedAt: s.endedAt ? new Date(s.endedAt) : null,
    plannedMinutes:
      s.plannedMinutes === 45 ? 45 : s.plannedMinutes === 25 ? 25 : null,
    completed: s.completed === true,
  }));
  const openSession = sessions.find((s) => s.endedAt === null) ?? null;
  const latestSession = sessions.at(-1) ?? null;

  return {
    id: task.id,
    title: task.description,
    project: task.project?.name ?? null,
    due,
    size: sizeLabel(task.size ?? null),
    content: task.content ?? null,
    outcome: task.outcome ?? null,
    startedAt: task.startedAt ? new Date(task.startedAt) : null,
    sessionStartedAt: openSession?.startedAt ?? null,
    focusSessionMinutes:
      openSession?.plannedMinutes === 45 || openSession?.plannedMinutes === 25
        ? openSession.plannedMinutes
        : task.user?.focusSessionMinutes === 45
          ? 45
          : 25,
    sessionComplete: !openSession && latestSession?.completed === true,
    completedFocusSessions: sessions.filter((session) => session.completed)
      .length,
    updates:
      task.updates?.map((u) => ({
        id: u.id,
        body: u.body,
        createdAt: u.createdAt,
        kind: u.kind as "NOTE" | "COMPLETED",
      })) ?? [],
  };
}
