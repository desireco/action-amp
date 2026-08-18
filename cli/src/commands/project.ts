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
import { emit, fail, formatAttachmentLine, type OutputCtx } from "../output.js";
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
            const list = p.type === "SIMPLE_LIST" ? chalk.gray(" (simple list)") : "";
            const count =
              p.type === "SIMPLE_LIST"
                ? p.openItems != null ? chalk.gray(` (${p.openItems} open)`) : ""
                : p.taskCount == null ? "" : chalk.gray(` (${p.taskCount})`);
            process.stdout.write(`  ${chalk.gray(`${i + 1}.`)} ${p.name}${count}${list}${done}\n`);
            p.resources?.forEach((resource) => {
              process.stdout.write(`     ${chalk.gray("↳")} ${resource.title}${resource.url ? chalk.gray(` — ${resource.url}`) : ""}\n`);
            });
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
            const listTag = result.project.type === "SIMPLE_LIST" ? chalk.gray(" (simple list)") : "";
            process.stdout.write(`${result.project.name}${listTag}\n`);
            if (result.project.description) {
              process.stdout.write(`  ${chalk.gray(result.project.description)}\n`);
            }
            if (result.project.type === "SIMPLE_LIST") {
              const open = result.project.openItems ?? 0;
              const checked = result.project.checkedItems ?? 0;
              process.stdout.write(`  ${chalk.gray(`${open} open · ${checked} checked — manage items in the app or with: actionamp capture --list-id ${result.project.id}`)}\n`);
            }
            // The ids make `attachment download <id>` usable from text
            // output (same precedent as `inbox list`).
            result.project.attachments?.forEach((a) => {
              process.stdout.write(`  ${formatAttachmentLine(a)}\n`);
            });
            if (result.project.resources?.length) {
              process.stdout.write("  Resources:\n");
              result.project.resources.forEach((resource) => {
                process.stdout.write(`    - ${resource.title}${resource.url ? chalk.gray(` — ${resource.url}`) : ""}\n`);
                resource.attachments?.forEach((a) => {
                  process.stdout.write(`      ${formatAttachmentLine(a)}\n`);
                });
              });
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
    .option("--list", "create a Simple list (a direct checklist) instead of a standard project")
    .option("--json", "emit JSON output")
    .action(async (name: string, opts: { lensId?: string; goalId?: string; description?: string; list?: boolean; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      if (!lensId) {
        fail("lens-id required (or run: actionamp lens switch <name>).", ctx);
      }
      const body: Record<string, unknown> = { name, lensId: lensId! };
      if (opts.list) body.type = "SIMPLE_LIST";
      if (opts.goalId && !opts.list) body.goalId = opts.goalId;
      if (opts.description) body.description = opts.description;
      const result = await request<{ project: Project }>("/api/cli/project/create", {
        method: "POST",
        body,
      });
      emit(
        result,
        () => {
          const kind = opts.list ? " (simple list)" : "";
          process.stdout.write(`Created project '${result.project.name}'${kind}.\n`);
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
