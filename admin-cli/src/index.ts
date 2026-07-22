#!/usr/bin/env node
/**
 * actionamp-admin — the admin terminal client for ActionAmp.
 *
 * Restricted to admin accounts (login rejects non-admins). Talks to the same
 * backend as the user CLI but stores its own token at
 * ~/.config/actionamp-admin/, so the two can coexist on one machine.
 *
 * Usage:
 *   actionamp-admin login [--dev]      authenticate as an admin via browser
 *   actionamp-admin whoami            show the logged-in admin account
 *   actionamp-admin feedback list     list submitted feedback
 *   actionamp-admin feedback show <id>      show one feedback row
 *   actionamp-admin feedback status <id> <status>   set triage state
 *   actionamp-admin logout            clear saved admin token
 *
 * Every command supports --json for scripting. See admin-cli/README.md.
 */
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApiError } from "./api.js";
import { fail, type OutputCtx } from "./output.js";
import { makeLoginCommand } from "./commands/login.js";
import { makeWhoamiCommand } from "./commands/whoami.js";
import { makeLogoutCommand } from "./commands/logout.js";
import { makeFeedbackCommand } from "./commands/feedback.js";

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
  .name("actionamp-admin")
  .description("ActionAmp admin — feedback triage + admin ops (admin accounts only)")
  .version(readVersion());

program.addCommand(makeLoginCommand());
program.addCommand(makeWhoamiCommand());
program.addCommand(makeFeedbackCommand());
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
