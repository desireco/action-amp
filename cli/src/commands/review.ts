/** Read-only Week and Month accomplishment reports for humans and agents. */
import { Command, Option } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { emit, type OutputCtx } from "../output.js";
import type { ReviewReport, ReviewReportResult, ReviewTask } from "../types.js";

type ReviewOptions = {
  for?: string;
  previous?: boolean;
  lensId?: string;
  timeZone?: string;
  json?: boolean;
};

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function formatAction(task: ReviewTask): string {
  const context = task.project?.name ?? task.goal?.name ?? task.lens.name;
  return `${task.size ?? "–"}  ${task.title} ${chalk.gray(`· ${context}`)}`;
}

function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export function formatReviewReport(report: ReviewReport): string {
  const cadence = report.cadence === "WEEKLY" ? "Week" : "Month";
  const lines = [
    `${cadence} ${report.state === "in_progress" ? "check-in" : "review"}`,
    report.period.label,
  ];
  lines.push("");
  lines.push(
    report.state === "in_progress" ? "Completed so far" : "Accomplished",
  );
  lines.push(
    `  ${countLabel(report.totals.actions, "action")} · ${countLabel(report.totals.projects, "project")} · ${countLabel(report.totals.goals, "goal")}`,
  );
  if (report.totals.focusMinutes > 0) {
    lines.push(`  ${formatMinutes(report.totals.focusMinutes)} recorded focus`);
  }

  if (report.actionsByLens.length > 0) {
    lines.push("", "By lens");
    for (const item of report.actionsByLens) {
      lines.push(`  ${item.lens.name}  ${item.count}`);
    }
  }

  if (report.goals.length > 0) {
    lines.push("", "Goals completed");
    for (const goal of report.goals)
      lines.push(`  ${chalk.green("✓")} ${goal.name}`);
  }
  if (report.projects.length > 0) {
    lines.push("", "Projects completed");
    for (const project of report.projects) {
      lines.push(`  ${chalk.green("✓")} ${project.name}`);
    }
  }
  if (report.highlights.length > 0) {
    lines.push("", "Significant actions");
    for (const task of report.highlights) {
      lines.push(`  ${formatAction(task)}`);
      if (task.outcome) lines.push(chalk.gray(`     ${task.outcome}`));
    }
  }

  const checkIn = [
    report.checkIn.howGoing,
    report.checkIn.goingWell,
    report.checkIn.challenges,
    report.checkIn.currentAttention,
  ].filter((value): value is string => Boolean(value));
  if (checkIn.length > 0) {
    lines.push("", "Check-in");
    for (const value of checkIn) lines.push(`  ${value}`);
  }

  const reflections = [
    report.reflection.moved,
    report.reflection.change,
    report.reflection.proud,
    report.reflection.learned,
    report.reflection.attention,
  ].filter((value): value is string => Boolean(value));
  if (reflections.length > 0 || report.emphasisGoal) {
    lines.push("", "Reflection");
    for (const value of reflections) lines.push(`  ${value}`);
    if (report.emphasisGoal) {
      lines.push(`  Next emphasis: ${report.emphasisGoal.name}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function makeCadenceCommand(
  name: "week" | "month",
  cadence: "WEEKLY" | "MONTHLY",
): Command {
  const cmd = new Command(name);
  cmd
    .description(`show a read-only ${name} accomplishment report`)
    .addOption(
      new Option(
        "--for <date>",
        "date within the review period (YYYY-MM-DD)",
      ).conflicts("previous"),
    )
    .option("--previous", `show the previous ${name}`)
    .option("--lens-id <id>", "filter to one lens; default is all lenses")
    .option("--time-zone <iana>", "IANA time zone; default is this machine's")
    .option("--json", "emit JSON output")
    .action(async (opts: ReviewOptions) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const timeZone =
        opts.timeZone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone ??
        "UTC";
      const params = new URLSearchParams({ cadence, timeZone });
      if (opts.for) params.set("for", opts.for);
      if (opts.previous) params.set("previous", "true");
      if (opts.lensId) params.set("lensId", opts.lensId);
      const result = await request<ReviewReportResult>(
        `/api/cli/review?${params.toString()}`,
      );
      emit(
        result,
        () => process.stdout.write(formatReviewReport(result.report)),
        ctx,
      );
    });
  return cmd;
}

export function makeReviewCommand(): Command {
  const cmd = new Command("review").description(
    "read-only Week and Month accomplishment reports",
  );
  cmd.addCommand(makeCadenceCommand("week", "WEEKLY"));
  cmd.addCommand(makeCadenceCommand("month", "MONTHLY"));
  return cmd;
}
