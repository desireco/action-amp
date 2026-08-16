/**
 * Output — the shared emit/error helpers.
 *
 * Every command supports --json. When jsonMode is true, results go to stdout
 * as JSON and errors go to stderr as {error}. When false, the human() callback
 * runs for success and a plain message goes to stderr for errors.
 */
import chalk from "chalk";

export type OutputCtx = { json: boolean };

export function emit(json: unknown, human: () => void, ctx: OutputCtx): void {
  if (ctx.json) {
    process.stdout.write(JSON.stringify(json) + "\n");
  } else {
    human();
  }
}

export function fail(message: string, ctx: OutputCtx, code = 1): never {
  if (ctx.json) {
    process.stdout.write(JSON.stringify({ error: message }) + "\n");
  } else {
    process.stderr.write(`${chalk.red("error:")} ${message}\n`);
  }
  process.exit(code);
}

/**
 * Format a task for human output: "Description · in ProjectName" or
 * "Description · for GoalName". Calm — no exclamation marks, no streaks.
 */
export function formatTask(t: {
  description: string;
  project?: { name: string } | null;
  goal?: { name: string } | null;
}): string {
  const ctx =
    t.project?.name
      ? ` ${chalk.gray("·")} ${chalk.gray("in")} ${t.project.name}`
      : t.goal?.name
        ? ` ${chalk.gray("·")} ${chalk.gray("for")} ${t.goal.name}`
        : "";
  return `${t.description}${ctx}`;
}

/**
 * One captured-image metadata line for human output — the trailing id makes
 * `attachment download <id>` usable from text output without a --json
 * round-trip. Shared by the task/project/resource/inbox listings.
 */
export function formatAttachmentLine(a: {
  filename: string;
  id: string;
}): string {
  return chalk.gray(`image ${a.filename} — ${a.id}`);
}

/** Format a relative-time string ("Used 3 min ago") or "Never used". */
export function formatLastUsed(iso: string | null): string {
  if (!iso) return "Never used";
  const then = new Date(iso).getTime();
  const ago = Date.now() - then;
  const mins = Math.floor(ago / 60000);
  if (mins < 1) return "Used just now";
  if (mins < 60) return `Used ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Used ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Used ${days} day${days === 1 ? "" : "s"} ago`;
  return `Used ${new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })}`;
}
