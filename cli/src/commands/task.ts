/**
 * task — the decision-loop verbs (start/pause/done/snooze/move/sweep/show).
 *
 * Each takes an id-or-permalink as the first arg. `done` is the headline — it
 * marks the top task complete and (in a future slice) prints the next one.
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, fail, formatAttachmentLine, formatTask, type OutputCtx } from "../output.js";
import type { Task, TaskMutationResult } from "../types.js";

type SweepResult = { dryRun: boolean; tasks: Task[] };

export function makeTaskCommand(): Command {
  const task = new Command("task");
  task.description("task actions (start, pause, done, snooze, move, show)");

  task
    .command("show <id>")
    .description("show a single task")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ task: Task | null }>(
        `/api/cli/task/show?id=${encodeURIComponent(id)}`,
      );
      emit(
        result,
        () => {
          if (result.task) {
            process.stdout.write(formatTask(result.task) + "\n");
            // The ids make `attachment download <id>` usable from text output
            // without a --json round-trip (shared formatter, per the M5 review).
            result.task.attachments?.forEach((a) => {
              process.stdout.write(`  ${formatAttachmentLine(a)}\n`);
            });
          } else {
            process.stdout.write("No such task.\n");
          }
        },
        ctx,
      );
    });

  task
    .command("start <id>")
    .description("start a task (sets it as the focused task)")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ id: string; startedAt: string | null }>(
        "/api/cli/task/start",
        { method: "POST", body: { id } },
      );
      emit(
        result,
        () => {
          process.stdout.write(`Started.\n`);
        },
        ctx,
      );
    });

  task
    .command("pause <id>")
    .description("pause the focused task")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ id: string; startedAt: string | null }>(
        "/api/cli/task/pause",
        { method: "POST", body: { id } },
      );
      emit(
        result,
        () => {
          process.stdout.write(`Paused.\n`);
        },
        ctx,
      );
    });

  task
    .command("done <id>")
    .description("mark a task done")
    .option("--outcome <text>", "an optional completion note")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { outcome?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const body: Record<string, unknown> = { id };
      if (opts.outcome !== undefined) body.outcome = opts.outcome;
      const result = await request<TaskMutationResult>("/api/cli/task/done", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          process.stdout.write(`Marked done.\n`);
        },
        ctx,
      );
    });

  task
    .command("snooze <id>")
    .description("snooze a task (presets: 1h, 3h, tomorrow, weekend, someday)")
    .option("--preset <preset>", "snooze preset", "tomorrow")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { preset: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{
        id: string;
        status: string;
        snoozedUntil: string | null;
      }>(
        "/api/cli/task/snooze",
        { method: "POST", body: { id, preset: opts.preset } },
      );
      emit(
        result,
        () => {
          const when =
            opts.preset === "someday"
              ? "someday"
              : result.snoozedUntil
                ? `until ${new Date(result.snoozedUntil).toLocaleString()}`
                : "until later";
          process.stdout.write(`Snoozed ${when}.\n`);
        },
        ctx,
      );
    });

  task
    .command("move <id>")
    .description("move a task to today, upcoming, or someday")
    .requiredOption("--to <list>", "destination: today, upcoming, or someday")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { to: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const status = opts.to.toUpperCase() as "TODAY" | "UPCOMING" | "SOMEDAY";
      const result = await request<TaskMutationResult>("/api/cli/task/move", {
        method: "POST",
        body: { id, status },
      });
      emit(
        result,
        () => {
          process.stdout.write(`Moved to ${opts.to}.\n`);
        },
        ctx,
      );
    });

  task
    .command("sweep")
    .description(
      "push stale upcoming tasks to someday (dry run unless --apply)",
    )
    .option("--older-than <days>", "days untouched before a task counts as stale", "30")
    .option("--lens-id <id>", "sweep a single lens (default: all accessible)")
    .option("--apply", "move the tasks (default shows what would move)")
    .option("--json", "emit JSON output")
    .action(
      async (opts: {
        olderThan: string;
        lensId?: string;
        apply?: boolean;
        json?: boolean;
      }) => {
        const ctx: OutputCtx = { json: opts.json ?? false };
        const days = Number(opts.olderThan);
        if (!Number.isInteger(days) || days < 1 || days > 365) {
          fail("--older-than must be a whole number between 1 and 365.", ctx);
        }
        const body: Record<string, unknown> = { olderThanDays: days };
        const lensId = opts.lensId ?? readConfig()?.lensId;
        if (lensId) body.lensId = lensId;
        if (opts.apply) body.apply = true;
        const result = await request<SweepResult>("/api/cli/task/sweep", {
          method: "POST",
          body,
        });
        emit(
          result,
          () => {
            if (result.tasks.length === 0) {
              process.stdout.write("Nothing stale enough to sweep.\n");
              return;
            }
            const verb = result.dryRun ? "would move" : "moved";
            process.stdout.write(
              `${result.tasks.length} task${result.tasks.length === 1 ? "" : "s"} ${verb} to Someday:\n`,
            );
            result.tasks.forEach((t) => {
              const lens = t.lens?.name
                ? ` ${chalk.gray("·")} ${chalk.gray("lens")} ${t.lens.name}`
                : "";
              process.stdout.write(`  ${formatTask(t)}${lens}\n`);
            });
            if (result.dryRun) {
              process.stdout.write("Run again with --apply to move them.\n");
            }
          },
          ctx,
        );
      },
    );

  return task;
}
