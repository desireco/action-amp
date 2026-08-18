/**
 * lens — list, show, switch, current.
 *
 * Lenses are the top-level scope (a life context — Work, Me, …). Every other
 * command (`now`, `project list`, `goal list`, `logbook`, `inbox triage`) is
 * lens-scoped. Rather than forcing `--lens-id <uuid>` on every call, `lens
 * switch` stores the active lens in config; subsequent commands fall back to
 * it when no flag is passed. Mirrors the web app's localStorage["aa-lens-id"]
 * — there is no server-side active lens; each client tracks its own.
 *
 * No create / update / delete here: lens configuration is Pro-only and stays
 * in the desktop Settings UI (`docs/specs/lens-management.md`).
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig, setActiveLens } from "../config.js";
import { emit, fail, type OutputCtx } from "../output.js";
import type { Lens } from "../types.js";

export function makeLensCommand(): Command {
  const lens = new Command("lens");
  lens.description("lens actions (list, show, switch, current)");

  // lens list — every owned lens, with the active one marked.
  lens
    .command("list")
    .description("list your lenses (the active one is marked)")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ lenses: Lens[] }>("/api/cli/lens/list");
      const activeId = readConfig()?.lensId;
      emit(
        result,
        () => {
          if (result.lenses.length === 0) {
            process.stdout.write(
              "No lenses. Complete onboarding in the app first.\n",
            );
            return;
          }
          result.lenses.forEach((l, i) => {
            const active = l.id === activeId ? chalk.cyan(" ← active") : "";
            const purpose = l.purpose ? chalk.gray(` — ${l.purpose}`) : "";
            process.stdout.write(
              `  ${chalk.gray(`${i + 1}.`)} ${l.name}${purpose}${active}\n`,
            );
          });
        },
        ctx,
      );
    });

  // lens show <id|name> — detail on one lens.
  lens
    .command("show <idOrName>")
    .description("show a single lens (by id or name)")
    .option("--json", "emit JSON output")
    .action(async (idOrName: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ lens: Lens | null }>(
        `/api/cli/lens/show?idOrName=${encodeURIComponent(idOrName)}`,
      );
      emit(
        result,
        () => {
          if (!result.lens) {
            process.stdout.write("No such lens.\n");
            return;
          }
          const l = result.lens;
          const activeId = readConfig()?.lensId;
          const active = l.id === activeId ? chalk.cyan(" (active)") : "";
          process.stdout.write(`${l.name}${active}\n`);
          if (l.purpose) {
            process.stdout.write(`  ${chalk.gray(l.purpose)}\n`);
          }
          if (l.counts) {
            const c = l.counts;
            const summary = `${c.tasks} task${c.tasks === 1 ? "" : "s"} · ${c.projects} project${c.projects === 1 ? "" : "s"} · ${c.goals} goal${c.goals === 1 ? "" : "s"}`;
            process.stdout.write(`  ${chalk.gray(summary)}\n`);
          }
          process.stdout.write(`  ${chalk.gray(l.id)}\n`);
        },
        ctx,
      );
    });

  // lens switch <id|name> — set the active lens. Resolves name → id via show
  // so `switch Work` works without a uuid copy-paste.
  lens
    .command("switch <idOrName>")
    .description("set the active lens (subsequent commands scope to it)")
    .option("--json", "emit JSON output")
    .action(async (idOrName: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ lens: Lens | null }>(
        `/api/cli/lens/show?idOrName=${encodeURIComponent(idOrName)}`,
      );
      if (!result.lens) {
        fail("No such lens.", ctx);
      }
      const lens = result.lens;
      setActiveLens(lens.id);
      emit(
        { ok: true, id: lens.id, name: lens.name },
        () => {
          const next =
            "  now / project list / goal list will use it until you switch it again.";
          process.stdout.write(
            `Switched to '${lens.name}'.\n${chalk.gray(next)}\n`,
          );
        },
        ctx,
      );
    });

  // lens current — print the active lens (or a hint if none is set).
  lens
    .command("current")
    .description("show the active lens")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const activeId = readConfig()?.lensId;
      if (!activeId) {
        emit(
          { lens: null },
          () => {
            process.stdout.write(
              `No active lens. ${chalk.gray("(commands default to your first accessible lens — run: actionamp lens switch <name>)")}\n`,
            );
          },
          ctx,
        );
        return;
      }
      const result = await request<{ lens: Lens | null }>(
        `/api/cli/lens/show?idOrName=${encodeURIComponent(activeId)}`,
      );
      emit(
        result,
        () => {
          if (!result.lens) {
            // The stored id no longer resolves (deleted on desktop, or stale).
            process.stdout.write(
              `Active lens was deleted. ${chalk.gray("Run: actionamp lens switch <name>")}\n`,
            );
            return;
          }
          const l = result.lens;
          process.stdout.write(`${l.name}\n`);
          if (l.purpose) {
            process.stdout.write(`  ${chalk.gray(l.purpose)}\n`);
          }
          process.stdout.write(`  ${chalk.gray(l.id)}\n`);
        },
        ctx,
      );
    });

  return lens;
}
