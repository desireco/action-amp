#!/usr/bin/env node
/**
 * actionamp — the terminal client for ActionAmp.
 *
 * Usage:
 *   actionamp                 login status + command help
 *   actionamp login [--dev]   authenticate via browser
 *   actionamp now             your top task
 *   actionamp capture "<text>" quick-capture to inbox
 *   actionamp whoami          show the logged-in account
 *   actionamp logout          clear saved token
 *
 * Every command supports --json for scripting. See cli/README.md.
 */
import { Command } from "commander";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApiError, fetchApi } from "./api.js";
import { readConfig } from "./config.js";
import { fail, type OutputCtx } from "./output.js";
import type { Whoami } from "./types.js";
import { makeLoginCommand } from "./commands/login.js";
import { makeNowCommand } from "./commands/now.js";
import { makeCaptureCommand } from "./commands/capture.js";
import { makeWhoamiCommand } from "./commands/whoami.js";
import { makeTaskCommand } from "./commands/task.js";
import { makeTodayCommand } from "./commands/today.js";
import { makeInboxCommand } from "./commands/inbox.js";
import { makeAttachmentCommand } from "./commands/attachment.js";
import { makeProjectCommand } from "./commands/project.js";
import { makeResourceCommand } from "./commands/resource.js";
import { makeGoalCommand } from "./commands/goal.js";
import { makeLensCommand } from "./commands/lens.js";
import { makeLogbookCommand } from "./commands/logbook.js";
import { makeReviewCommand } from "./commands/review.js";
import { makeLlmCommand } from "./commands/llm.js";
import { makeLogoutCommand } from "./commands/logout.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// `actionamp | head` (or any early-closing pipe) must not die with an EPIPE
// stack trace — exit quietly instead, the conventional CLI guard.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

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
program.addCommand(makeResourceCommand());
program.addCommand(makeGoalCommand());
program.addCommand(makeLensCommand());
program.addCommand(makeLogbookCommand());
program.addCommand(makeReviewCommand());
program.addCommand(makeLlmCommand());
program.addCommand(makeLogoutCommand());

// Bare `actionamp` — the status view: who you are (or that you're not
// logged in), then the command reference. The whoami check is guarded by a
// 3-second deadline so an unreachable API can't stall the status line.
program.action(async () => {
  const cfg = readConfig();
  if (!cfg) {
    process.stdout.write("Not logged in. Run: actionamp login\n\n");
  } else {
    try {
      const { status, body } = await Promise.race([
        fetchApi<Whoami>(cfg.apiUrl, cfg.token, "/api/cli/whoami"),
        new Promise<{ status: number; body: Whoami }>((resolve) =>
          setTimeout(
            () => resolve({ status: 0, body: {} as Whoami }),
            3_000,
          ),
        ),
      ]);
      const who = (body ?? {}) as Whoami;
      if (status === 200 && who.user) {
        process.stdout.write(
          `Logged in as ${who.user.email ?? who.user.fullName ?? "unknown"} (plan: ${who.user.plan ?? "?"}).\n\n`,
        );
      } else if (status === 401) {
        process.stdout.write("Saved token was rejected. Run: actionamp login\n\n");
      } else if (status === 402) {
        process.stdout.write("CLI access is a Pro feature. Upgrade from Settings → Billing.\n\n");
      } else {
        process.stdout.write(
          `Logged in (token saved for ${cfg.apiUrl}) — could not verify right now.\n\n`,
        );
      }
    } catch {
      process.stdout.write(
        `Logged in (token saved for ${cfg.apiUrl}) — could not verify right now.\n\n`,
      );
    }
  }
  program.outputHelp();
});

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
