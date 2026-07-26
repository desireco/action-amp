/**
 * project — list, show, create, add-task.
 *
 * `--lens-id` is optional on list/create/add-task: an explicit flag wins, else
 * fall back to the active lens in config (set by `lens switch`). If neither is
 * set, the command errors with a calm hint rather than the server 400.
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, fail, type OutputCtx } from "../output.js";
import type { Project } from "../types.js";

export function makeProjectCommand(): Command {
  const project = new Command("project");
  project.description("project actions (list, show, create, add-task)");

  project
    .command("list")
    .description("show projects in a lens")
    .option("--lens-id <id>", "lens to list projects in (default: the active lens)")
    .option("--json", "emit JSON output")
    .action(async (opts: { lensId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      if (!lensId) {
        fail("lens-id required (or run: actionamp lens switch <name>).", ctx);
      }
      const result = await request<{ projects: Project[] }>(
        `/api/cli/project/list?lensId=${encodeURIComponent(lensId!)}`,
      );
      emit(
        result,
        () => {
          if (result.projects.length === 0) {
            process.stdout.write("No projects.\n");
            return;
          }
          result.projects.forEach((p, i) => {
            const done = p.isDone ? chalk.gray(" (done)") : "";
            const count = p.taskCount != null ? chalk.gray(` (${p.taskCount})`) : "";
            process.stdout.write(`  ${chalk.gray(`${i + 1}.`)} ${p.name}${count}${done}\n`);
          });
        },
        ctx,
      );
    });

  project
    .command("show <id>")
    .description("show a single project")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ project: Project | null }>(
        `/api/cli/project/show?id=${encodeURIComponent(id)}`,
      );
      emit(
        result,
        () => {
          if (result.project) {
            process.stdout.write(`${result.project.name}\n`);
            if (result.project.description) {
              process.stdout.write(`  ${chalk.gray(result.project.description)}\n`);
            }
          } else {
            process.stdout.write("No such project.\n");
          }
        },
        ctx,
      );
    });

  project
    .command("create <name>")
    .description("create a new project")
    .option("--lens-id <id>", "lens to create the project in (default: the active lens)")
    .option("--goal-id <id>", "goal the project belongs to")
    .option("--description <text>", "project description")
    .option("--json", "emit JSON output")
    .action(async (name: string, opts: { lensId?: string; goalId?: string; description?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      if (!lensId) {
        fail("lens-id required (or run: actionamp lens switch <name>).", ctx);
      }
      const body: Record<string, unknown> = { name, lensId: lensId! };
      if (opts.goalId) body.goalId = opts.goalId;
      if (opts.description) body.description = opts.description;
      const result = await request<{ project: Project }>("/api/cli/project/create", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          process.stdout.write(`Created project '${result.project.name}'.\n`);
        },
        ctx,
      );
    });

  project
    .command("add-task <description>")
    .description("add a task to a project (or directly to a lens)")
    .option("--lens-id <id>", "lens the task belongs to (default: the active lens)")
    .option("--project-id <id>", "project to file the task under")
    .option("--goal-id <id>", "goal to file the task under")
    .option("--json", "emit JSON output")
    .action(async (description: string, opts: { lensId?: string; projectId?: string; goalId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      if (!lensId) {
        fail("lens-id required (or run: actionamp lens switch <name>).", ctx);
      }
      const body: Record<string, unknown> = { description, lensId: lensId! };
      if (opts.projectId) body.projectId = opts.projectId;
      if (opts.goalId) body.goalId = opts.goalId;
      const result = await request<{ task: { id: string; permalink?: string } }>(
        "/api/cli/project/add-task",
        { method: "POST", body },
      );
      emit(
        result,
        () => {
          process.stdout.write(`Added task '${description}'.\n`);
        },
        ctx,
      );
    });

  return project;
}
