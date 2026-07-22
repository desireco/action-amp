/**
 * stats — product stats for admins (signups, active users, tasks, feedback).
 *
 *   actionamp-admin stats [--json]
 *
 * Fetches a single aggregated block from /api/cli/admin/stats and renders it
 * either as a calm padded-key text block (default) or as the raw JSON object
 * (--json) for scripting / monitoring.
 */
import { Command } from "commander";
import { request } from "../api.js";
import { emit, formatStats, type OutputCtx } from "../output.js";
import type { StatsResult } from "../types.js";

export function makeStatsCommand(): Command {
  const stats = new Command("stats");
  stats
    .description("product stats — signups, active users, tasks, feedback (admin)")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<StatsResult>("/api/cli/admin/stats");
      emit(
        result,
        () => {
          process.stdout.write(formatStats(result.stats) + "\n");
        },
        ctx,
      );
    });
  return stats;
}
