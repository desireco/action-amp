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
  status: string;
  dueDate?: Date | string | null;
  size?: string | null;
  startedAt?: Date | string | null;
  project?: { name: string } | null;
  updates?: { id: string; body: string; createdAt: Date; kind: string }[];
}): FocusTask {
  const due =
    task.status === "TODAY"
      ? "due today"
      : task.dueDate
        ? `due ${formatWhen(task.dueDate)}`
        : null;
  return {
    id: task.id,
    title: task.description,
    project: task.project?.name ?? null,
    due,
    size: sizeLabel(task.size ?? null),
    content: task.content ?? null,
    startedAt: task.startedAt ? new Date(task.startedAt) : null,
    updates:
      task.updates?.map((u) => ({
        id: u.id,
        body: u.body,
        createdAt: u.createdAt,
        kind: u.kind as "NOTE" | "COMPLETED",
      })) ?? [],
  };
}
