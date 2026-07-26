/** now — print your top task (the headline command). */
import { Command } from "commander";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, formatTask, type OutputCtx } from "../output.js";
import type { NowResult } from "../types.js";

export function makeNowCommand(): Command {
  const cmd = new Command("now");
  cmd
    .description("print your top task")
    .option("--lens-id <id>", "scope to a specific lens (overrides the active lens)")
    .option("--json", "emit JSON output")
    .action(async (opts: { lensId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      // --lens-id flag wins; else fall back to the active lens in config (set by
      // `lens switch`); else let the server pick the first accessible lens.
      const lensId = opts.lensId ?? readConfig()?.lensId;
      const qs = lensId ? `?lensId=${encodeURIComponent(lensId)}` : "";
      const result = await request<NowResult>(`/api/cli/now${qs}`);
      emit(
        result,
        () => {
          if (result.task) {
            process.stdout.write(formatTask(result.task) + "\n");
          } else if (result.reason === "no-lens") {
            process.stdout.write("No lens yet. Complete onboarding in the app first.\n");
          } else {
            process.stdout.write("Nothing on the table.\n");
          }
        },
        ctx,
      );
    });
  return cmd;
}
