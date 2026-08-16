/** Project-owned reference material: links and notes, never uploaded files. */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { Resource } from "../types.js";

export function makeResourceCommand(): Command {
  const resource = new Command("resource");
  resource.description("project resource actions (list, add, update, delete)");

  resource.command("list")
    .description("show a project's links and notes")
    .requiredOption("--project <id>", "project id or permalink")
    .option("--json", "emit JSON output")
    .action(async (opts: { project: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ projectId: string; resources: Resource[] }>(`/api/cli/resource/list?projectId=${encodeURIComponent(opts.project)}`);
      emit(result, () => {
        if (!result.resources.length) return process.stdout.write("No resources.\n");
        result.resources.forEach((item, index) => {
          process.stdout.write(`  ${chalk.gray(`${index + 1}.`)} ${item.title}${item.url ? chalk.gray(` — ${item.url}`) : ""}\n`);
          if (item.notes) process.stdout.write(`     ${chalk.gray(item.notes)}\n`);
          // The ids make `attachment download <id>` usable from text output.
          item.attachments?.forEach((a) => {
            process.stdout.write(`     ${chalk.gray(`image ${a.filename} — ${a.id}`)}\n`);
          });
        });
      }, ctx);
    });

  resource.command("add <title>")
    .description("add a link or note to a project")
    .requiredOption("--project <id>", "project id")
    .option("--url <url>", "http(s) link")
    .option("--notes <text>", "reference notes")
    .option("--json", "emit JSON output")
    .action(async (title: string, opts: { project: string; url?: string; notes?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const body: Record<string, string> = { projectId: opts.project, title };
      if (opts.url !== undefined) body.url = opts.url;
      if (opts.notes !== undefined) body.notes = opts.notes;
      const result = await request<{ resource: Resource }>("/api/cli/resource/create", { method: "POST", body });
      emit(result, () => process.stdout.write(`Added resource '${result.resource.title}'.\n`), ctx);
    });

  resource.command("update <id>")
    .description("change one or more resource fields")
    .option("--title <text>", "resource title")
    .option("--url <url>", "http(s) link; pass empty string to clear")
    .option("--notes <text>", "notes; pass empty string to clear")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { title?: string; url?: string; notes?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const body: Record<string, string> = { id };
      if (opts.title !== undefined) body.title = opts.title;
      if (opts.url !== undefined) body.url = opts.url;
      if (opts.notes !== undefined) body.notes = opts.notes;
      const result = await request<{ resource: Resource }>("/api/cli/resource/update", { method: "POST", body });
      emit(result, () => process.stdout.write(`Updated resource '${result.resource.title}'.\n`), ctx);
    });

  resource.command("delete <id>")
    .description("remove a project resource")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ id: string }>("/api/cli/resource/delete", { method: "POST", body: { id } });
      emit(result, () => process.stdout.write("Removed resource.\n"), ctx);
    });

  return resource;
}
