#!/usr/bin/env node
/**
 * actionamp — the terminal client for ActionAmp.
 *
 * Usage:
 *   actionamp login [--dev]     authenticate via browser
 *   actionamp now               your top task
 *   actionamp capture "<text>"  quick-capture to inbox
 *   actionamp whoami            show the logged-in account
 *   actionamp logout            clear saved token
 *
 * Every command supports --json for scripting. See cli/README.md.
 */
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApiError } from "./api.js";
import { fail, type OutputCtx } from "./output.js";
import { makeLoginCommand } from "./commands/login.js";
import { makeNowCommand } from "./commands/now.js";
import { makeCaptureCommand } from "./commands/capture.js";
import { makeWhoamiCommand } from "./commands/whoami.js";
import { makeTaskCommand } from "./commands/task.js";
import { makeTodayCommand } from "./commands/today.js";
import { makeInboxCommand } from "./commands/inbox.js";
import { makeProjectCommand } from "./commands/project.js";
import { makeGoalCommand } from "./commands/goal.js";
import { makeLogbookCommand } from "./commands/logbook.js";
import { makeLogoutCommand } from "./commands/logout.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json (works both in dev via tsx and in dist/ after build)
function readVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    return JSON.parse(readFileSync(pkgPath, "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("actionamp")
  .description("ActionAmp — one task, the next one that matters")
  .version(readVersion());

program.addCommand(makeLoginCommand());
program.addCommand(makeNowCommand());
program.addCommand(makeCaptureCommand());
program.addCommand(makeWhoamiCommand());
program.addCommand(makeTaskCommand());
program.addCommand(makeTodayCommand());
program.addCommand(makeInboxCommand());
program.addCommand(makeProjectCommand());
program.addCommand(makeGoalCommand());
program.addCommand(makeLogbookCommand());
program.addCommand(makeLogoutCommand());

// Global error handler — catches ApiError + network failures, prints a calm
// message instead of a stack trace. --json mode emits {error} to stdout.
async function main(): Promise<void> {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof ApiError) {
      const ctx: OutputCtx = { json: program.opts().json ?? false };
      fail(err.message, ctx);
    }
    // Network / unknown errors — calm message, not a stack trace.
    const msg = err instanceof Error ? err.message : String(err);
    const ctx: OutputCtx = { json: program.opts().json ?? false };
    fail(
      msg.includes("fetch") || msg.includes("ECONNREFUSED")
        ? "Could not reach the server. Is it running?"
        : msg,
      ctx,
    );
  }
}

main();
