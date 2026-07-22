/** whoami — show the logged-in admin account. */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, fail, type OutputCtx } from "../output.js";
import type { Whoami } from "../types.js";

export function makeWhoamiCommand(): Command {
  const cmd = new Command("whoami");
  cmd
    .description("show the logged-in admin account")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<Whoami>("/api/cli/whoami");
      const u = result.user;
      // Defensive: login rejects non-admins, but if a token was somehow issued
      // to a non-admin and is sitting in config, say so loudly rather than
      // silently printing a healthy-looking line.
      if (!u.isAdmin) {
        fail(
          `${u.email ?? u.fullName} is not an admin. Run: actionamp-admin logout, then actionamp-admin login with an admin account.`,
          ctx,
        );
      }
      emit(
        result,
        () => {
          process.stdout.write(`${u.email ?? u.fullName} (plan: ${u.plan}, admin: yes)\n`);
        },
        ctx,
      );
    });
  return cmd;
}
