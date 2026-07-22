/** now — print your top task (the headline command). */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, formatTask, type OutputCtx } from "../output.js";
import type { NowResult } from "../types.js";

export function makeNowCommand(): Command {
  const cmd = new Command("now");
  cmd
    .description("print your top task")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<NowResult>("/api/cli/now");
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
