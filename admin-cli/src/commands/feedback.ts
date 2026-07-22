/**
 * feedback — admin triage surface for in-app feedback.
 *
 *   actionamp-admin feedback list [--status <s>] [--limit <n>]
 *   actionamp-admin feedback show <id>
 *   actionamp-admin feedback status <id> <status>
 *
 * All subcommands support --json. The status value is validated client-side
 * against the 4 allowed states for a fast, clear error before hitting the API.
 */
import { Command } from "commander";
import { request } from "../api.js";
import {
  emit,
  fail,
  formatFeedbackLine,
  formatFeedbackDetail,
  colorStatus,
  type OutputCtx,
} from "../output.js";
import {
  FEEDBACK_STATUSES,
  isFeedbackStatus,
  type Feedback,
  type FeedbackListResult,
  type FeedbackShowResult,
  type FeedbackStatusResult,
} from "../types.js";

export function makeFeedbackCommand(): Command {
  const feedback = new Command("feedback");
  feedback.description("triage in-app feedback (admin)");

  // ── feedback list ────────────────────────────────────────────────────────
  feedback
    .command("list")
    .description("list feedback, newest first")
    .option("--status <status>", `filter by status: ${FEEDBACK_STATUSES.join(", ")}`)
    .option("--limit <n>", "cap the number of rows (default 50)", (v) => Number(v))
    .option("--json", "emit JSON output")
    .action(async (opts: { status?: string; limit?: number; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };

      const params = new URLSearchParams();
      if (opts.status !== undefined) {
        if (!isFeedbackStatus(opts.status)) {
          fail(
            `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
            ctx,
          );
        }
        params.set("status", opts.status);
      }
      if (opts.limit !== undefined) {
        if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
          fail("limit must be a positive number.", ctx);
        }
        params.set("limit", String(Math.floor(opts.limit)));
      }

      const path = `/api/cli/feedback/list${params.size ? `?${params}` : ""}`;
      const result = await request<FeedbackListResult>(path);
      const rows = result.feedback;

      emit(
        result,
        () => {
          if (rows.length === 0) {
            process.stdout.write("No feedback.\n");
            return;
          }
          for (const f of rows) process.stdout.write(formatFeedbackLine(f) + "\n");
        },
        ctx,
      );
    });

  // ── feedback show ────────────────────────────────────────────────────────
  feedback
    .command("show <id>")
    .description("show one feedback row (id can be a shortId/UUID prefix)")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<FeedbackShowResult>(
        `/api/cli/feedback/show?id=${encodeURIComponent(id)}`,
      );
      emit(
        result,
        () => {
          process.stdout.write(formatFeedbackDetail(result.feedback) + "\n");
        },
        ctx,
      );
    });

  // ── feedback status ──────────────────────────────────────────────────────
  feedback
    .command("status <id> <status>")
    .description(`set a feedback row's status (id can be a prefix): ${FEEDBACK_STATUSES.join(", ")}`)
    .option("--json", "emit JSON output")
    .action(async (id: string, status: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      if (!isFeedbackStatus(status)) {
        fail(
          `Invalid status. Must be one of: ${FEEDBACK_STATUSES.join(", ")}.`,
          ctx,
        );
      }
      const result = await request<FeedbackStatusResult>(
        "/api/cli/feedback/status",
        { method: "POST", body: { id, status } },
      );
      const f: Feedback = result.feedback;
      emit(
        result,
        () => {
          process.stdout.write(`${id} → ${colorStatus(f.status)}\n`);
        },
        ctx,
      );
    });

  return feedback;
}
