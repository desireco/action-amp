/**
 * goal — list, show, create.
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { Goal } from "../types.js";

export function makeGoalCommand(): Command {
  const goal = new Command("goal");
  goal.description("goal actions (list, show, create)");

  goal
    .command("list")
    .description("show goals in a lens")
    .requiredOption("--lens-id <id>", "lens to list goals in")
    .option("--json", "emit JSON output")
    .action(async (opts: { lensId: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ goals: Goal[] }>(
        `/api/cli/goal/list?lensId=${encodeURIComponent(opts.lensId)}`,
      );
      emit(
        result,
        () => {
          if (result.goals.length === 0) {
            process.stdout.write("No goals.\n");
            return;
          }
          result.goals.forEach((g, i) => {
            const done = g.isDone ? chalk.gray(" (done)") : "";
            process.stdout.write(`  ${chalk.gray(`${i + 1}.`)} ${g.name}${done}\n`);
          });
        },
        ctx,
      );
    });

  goal
    .command("show <id>")
    .description("show a single goal")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ goal: Goal | null }>(
        `/api/cli/goal/show?id=${encodeURIComponent(id)}`,
      );
      emit(
        result,
        () => {
          if (result.goal) {
            process.stdout.write(`${result.goal.name}\n`);
            if (result.goal.description) {
              process.stdout.write(`  ${chalk.gray(result.goal.description)}\n`);
            }
          } else {
            process.stdout.write("No such goal.\n");
          }
        },
        ctx,
      );
    });

  goal
    .command("create <name>")
    .description("create a new goal")
    .requiredOption("--lens-id <id>", "lens to create the goal in")
    .option("--description <text>", "goal description")
    .option("--json", "emit JSON output")
    .action(async (name: string, opts: { lensId: string; description?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const body: Record<string, unknown> = { name, lensId: opts.lensId };
      if (opts.description) body.description = opts.description;
      const result = await request<{ goal: Goal }>("/api/cli/goal/create", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          process.stdout.write(`Created goal '${result.goal.name}'.\n`);
        },
        ctx,
      );
    });

  return goal;
}
