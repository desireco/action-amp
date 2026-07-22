/** logout — clear the saved admin token. */
import { Command } from "commander";
import { deleteConfig } from "../config.js";
import { emit, type OutputCtx } from "../output.js";

export function makeLogoutCommand(): Command {
  const cmd = new Command("logout");
  cmd
    .description("clear your saved admin token")
    .option("--json", "emit JSON output")
    .action((opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      deleteConfig();
      emit(
        { ok: true },
        () => {
          process.stdout.write("Signed out.\n");
        },
        ctx,
      );
    });
  return cmd;
}
