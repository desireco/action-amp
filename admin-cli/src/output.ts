/**
 * Output — the shared emit/error helpers.
 *
 * Same contract as the user CLI: --json emits results to stdout as JSON and
 * errors as {error}; human mode runs the human() callback for success and
 * writes a plain message to stderr for errors.
 */
import chalk from "chalk";
import type { AdminStats, Feedback, FeedbackStatus } from "./types.js";

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

/** Color a feedback status for human output. Calm — meaning, not decoration. */
export function colorStatus(status: FeedbackStatus): string {
  switch (status) {
    case "OPEN":
      return chalk.yellow(status);
    case "IN_PROGRESS":
      return chalk.cyan(status);
    case "RESOLVED":
      return chalk.green(status);
    case "CLOSED":
      return chalk.gray(status);
    default:
      return status;
  }
}

/**
 * Format one feedback row for a list line: short id, status, first line of
 * message, submitter. Calm — no exclamation, no streaks.
 */
export function formatFeedbackLine(f: Feedback): string {
  const id = chalk.gray(f.shortId);
  const status = colorStatus(f.status);
  const firstLine = f.message.split("\n")[0].slice(0, 80);
  const from = f.userEmail ?? f.userName ?? "unknown";
  return `${id}  ${status}  ${firstLine} ${chalk.gray("·")} ${chalk.gray(from)}`;
}

/** Format a feedback row for the `show` detail view. */
export function formatFeedbackDetail(f: Feedback): string {
  const lines = [
    `${chalk.bold(f.shortId)} ${chalk.gray(`(${f.id})`)}`,
    `status:   ${colorStatus(f.status)}`,
    `from:     ${f.userEmail ?? "unknown"}${f.userName ? ` (${f.userName})` : ""}`,
    `created:  ${new Date(f.createdAt).toLocaleString()}`,
    `updated:  ${new Date(f.updatedAt).toLocaleString()}`,
  ];
  if (f.route) lines.push(`route:    ${f.route}`);
  if (f.section) lines.push(`section:  ${f.section}`);
  if (f.lensName) lines.push(`lens:     ${f.lensName}${f.lensColor ? ` (${f.lensColor})` : ""}`);
  if (f.userAgent) lines.push(`agent:    ${f.userAgent}`);
  lines.push("", f.message);
  return lines.join("\n");
}

/** Calm padded-key stats block (mirrors formatFeedbackDetail's label style). */
export function formatStats(s: AdminStats): string {
  const pct =
    s.tasks.created7d > 0
      ? Math.round((s.tasks.completed7d / s.tasks.created7d) * 100)
      : null;
  const lines = [
    chalk.bold("Users"),
    `  total:           ${s.users.total}`,
    `  signed up today: ${s.users.signedUpToday}`,
    `  signed up 7d:    ${s.users.signedUp7d}`,
    `  signed up 30d:   ${s.users.signedUp30d}`,
    "",
    chalk.bold("Active users"),
    `  today:           ${s.users.activeToday}`,
    `  last 7 days:     ${s.users.active7d}`,
    `  last 30 days:    ${s.users.active30d}`,
    "",
    chalk.bold("Tasks (last 7 days)"),
    `  created:         ${s.tasks.created7d}`,
    `  completed:       ${s.tasks.completed7d}${pct !== null ? `  (${pct}% of created)` : ""}`,
    `  total:           ${s.tasks.total}`,
    "",
    chalk.bold("Feedback"),
    `  open:         ${s.feedback.byStatus.OPEN}`,
    `  in progress:  ${s.feedback.byStatus.IN_PROGRESS}`,
    `  resolved:     ${s.feedback.byStatus.RESOLVED}`,
    `  closed:       ${s.feedback.byStatus.CLOSED}`,
    `  total:        ${s.feedback.total}`,
  ];
  return lines.join("\n");
}
