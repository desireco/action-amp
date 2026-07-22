/** whoami — show the logged-in user. */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { Whoami } from "../types.js";

export function makeWhoamiCommand(): Command {
  const cmd = new Command("whoami");
  cmd
    .description("show the logged-in account")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<Whoami>("/api/cli/whoami");
      emit(
        result,
        () => {
          const u = result.user;
          process.stdout.write(`${u.email ?? u.fullName} (plan: ${u.plan})\n`);
        },
        ctx,
      );
    });
  return cmd;
}
