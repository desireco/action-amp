/** capture — quick-capture to inbox. NL parsing (#project, @date, !priority, tags). */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { CaptureResult } from "../types.js";

export function makeCaptureCommand(): Command {
  const cmd = new Command("capture");
  cmd
    .description("quick-capture text to your inbox")
    .argument("<text...>", "the text to capture")
    .option("--json", "emit JSON output")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async (textParts: any, opts: any) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const text: string = Array.isArray(textParts) ? textParts.join(" ") : String(textParts);
      const result = await request<CaptureResult>("/api/cli/capture", {
        method: "POST",
        body: { text },
      });
      emit(
        result,
        () => {
          process.stdout.write("Captured.\n");
        },
        ctx,
      );
    });
  return cmd;
}
