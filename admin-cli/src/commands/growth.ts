/** Growth funnel — first-party acquisition, activation, checkout, and payment. */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { FunnelRange, FunnelStats } from "../types.js";

export function makeGrowthCommand(): Command {
  const growth = new Command("growth");
  growth
    .description("first-party growth funnel (admin)")
    .option("--range <range>", "7d, 30d, or all", "30d")
    .option("--json", "emit JSON output")
    .action(async (opts: { range?: string; json?: boolean }) => {
      const range: FunnelRange = opts.range === "7d" || opts.range === "all" ? opts.range : "30d";
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<FunnelStats>(`/api/cli/admin/growth?range=${range}`);
      emit(result, () => {
        process.stdout.write(`Growth funnel (${range})\n`);
        for (const step of result.funnel) {
          const rate = step.fromPreviousPct === null ? "start" : `${step.fromPreviousPct}% from prior`;
          process.stdout.write(`  ${step.name.padEnd(22)} ${String(step.count).padStart(6)}  ${rate}\n`);
        }
        process.stdout.write("\nAcquisition\n");
        for (const source of result.sources) {
          process.stdout.write(`  ${source.source}: ${source.sessions} sessions, ${source.payments} paid\n`);
        }
      }, ctx);
    });
  return growth;
}
