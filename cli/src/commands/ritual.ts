/**
 * ritual — list, today, create, update, pause/resume, archive, check/uncheck.
 *
 * The habits layer from the terminal (docs/specs/rituals.md). Check-off
 * mirrors the app: `check` completes with an optional mood (--mood
 * good|okay|rough) and note; `uncheck` is one quiet undo of the day's entry.
 * `--lens-id` is optional on list/create — the active lens in config wins,
 * else the server's first accessible lens (Me, the creation default).
 */
import { Command } from "commander";
import chalk from "chalk";
import { request } from "../api.js";
import { readConfig } from "../config.js";
import { emit, fail, type OutputCtx } from "../output.js";

interface RitualRow {
  id: string;
  name: string;
  lensId: string;
  interval: "MORNING" | "MIDDAY" | "EVENING";
  cadence: "DAILY" | "WEEKDAYS" | "WEEKLY" | "INTERVAL";
  weekday: number | null;
  intervalDays: number | null;
  guidance: string | null;
  benefit: string | null;
  goalId: string | null;
  order: number;
  paused: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RitualListRow extends RitualRow {
  entryToday: { mood: string | null; note: string | null } | null;
}

interface RitualTodayRow extends RitualRow {
  lensName: string | null;
  checked: boolean;
  mood: string | null;
  note: string | null;
}

interface RitualHistoryEntry {
  localDate: string;
  mood: string | null;
  note: string | null;
  createdAt: string;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function cadenceLabel(r: Pick<RitualRow, "cadence" | "weekday" | "intervalDays">): string {
  switch (r.cadence) {
    case "DAILY":
      return "every day";
    case "WEEKDAYS":
      return "weekdays";
    case "WEEKLY":
      return `${WEEKDAYS[r.weekday ?? 0]}s`;
    case "INTERVAL":
      return `every ${r.intervalDays ?? "?"} days`;
  }
}

function hints(r: Pick<RitualRow, "guidance" | "benefit">): string {
  const marks = [
    r.guidance ? chalk.italic.gray("(g)") : "",
    r.benefit ? chalk.italic.gray("(b)") : "",
  ].filter(Boolean);
  return marks.length ? ` ${marks.join(" ")}` : "";
}

export function makeRitualCommand(): Command {
  const ritual = new Command("ritual");
  ritual.description("ritual actions (list, today, create, update, check)");

  ritual
    .command("list")
    .description("show rituals in a lens (default: the active lens)")
    .option("--lens-id <id>", "lens to list rituals in")
    .option("--json", "emit JSON output")
    .action(async (opts: { lensId?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const lensId = opts.lensId ?? readConfig()?.lensId;
      const path = lensId
        ? `/api/cli/ritual/list?lensId=${encodeURIComponent(lensId)}`
        : "/api/cli/ritual/list";
      const result = await request<{ rituals: RitualListRow[] }>(path);
      emit(
        result,
        () => {
          if (result.rituals.length === 0) {
            process.stdout.write("No rituals.\n");
            return;
          }
          result.rituals.forEach((r, i) => {
            const paused = r.paused ? chalk.gray(" (paused)") : "";
            process.stdout.write(
              `  ${chalk.gray(`${i + 1}.`)} ${r.name}${hints(r)} ${chalk.gray(`· ${r.interval.toLowerCase()} · ${cadenceLabel(r)}`)}${paused} ${chalk.gray(r.id)}\n`,
            );
          });
        },
        ctx,
      );
    });

  ritual
    .command("today")
    .description("show today's due rituals with checked state")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ rituals: RitualTodayRow[] }>("/api/cli/ritual/today");
      emit(
        result,
        () => {
          if (result.rituals.length === 0) {
            process.stdout.write("No rituals due today.\n");
            return;
          }
          result.rituals.forEach((r, i) => {
            const check = r.checked ? chalk.green("✓") : chalk.dim("○");
            const mood = r.checked && r.mood ? ` ${chalk.gray(`(${r.mood.toLowerCase()})`)}` : "";
            process.stdout.write(
              `  ${chalk.gray(`${i + 1}.`)} ${check} ${r.name}${hints(r)} ${chalk.gray(`· ${r.interval.toLowerCase()}`)}${mood} ${chalk.gray(r.id)}\n`,
            );
          });
        },
        ctx,
      );
    });

  ritual
    .command("show <id>")
    .description("show a ritual and its checked days (newest first)")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ ritual: RitualRow; entries: RitualHistoryEntry[] }>(
        `/api/cli/ritual/show?id=${encodeURIComponent(id)}`,
      );
      emit(
        result,
        () => {
          const r = result.ritual;
          process.stdout.write(`${r.name}${hints(r)} ${chalk.gray(`· ${r.interval.toLowerCase()} · ${cadenceLabel(r)}`)}\n`);
          if (r.guidance) process.stdout.write(`  ${chalk.gray("guidance:")} ${r.guidance}\n`);
          if (r.benefit) process.stdout.write(`  ${chalk.gray("benefit:")} ${r.benefit}\n`);
          if (result.entries.length === 0) {
            process.stdout.write(`  ${chalk.gray("No checks recorded yet.")}\n`);
            return;
          }
          for (const e of result.entries.slice(0, 15)) {
            const mood = e.mood ? ` ${chalk.gray(`(${e.mood.toLowerCase()})`)}` : "";
            const note = e.note ? ` ${chalk.gray(`— ${e.note}`)}` : "";
            process.stdout.write(`  ${chalk.green("✓")} ${e.localDate}${mood}${note}\n`);
          }
          if (result.entries.length > 15) {
            process.stdout.write(`  ${chalk.gray(`… ${result.entries.length - 15} more`)}\n`);
          }
        },
        ctx,
      );
    });

  ritual
    .command("create <name>")
    .description("create a ritual (defaults: morning, every day, Me lens)")
    .option("--lens-id <id>", "lens to create the ritual in (default: Me)")
    .option("--interval <slot>", "morning | midday | evening")
    .option("--cadence <kind>", "daily | weekdays | weekly | interval")
    .option("--weekday <day>", "mon..sun (weekly cadence)")
    .option("--every <days>", "every N days, 2-365 (interval cadence)")
    .option("--guidance <text>", "what you do (markdown)")
    .option("--benefit <text>", "what you get (markdown)")
    .option("--goal <id>", "link the ritual to a goal (the why at all)")
    .option("--json", "emit JSON output")
    .action(
      async (
        name: string,
        opts: {
          lensId?: string;
          interval?: string;
          cadence?: string;
          weekday?: string;
          every?: string;
          guidance?: string;
          benefit?: string;
          goal?: string;
          json?: boolean;
        },
      ) => {
        const ctx: OutputCtx = { json: opts.json ?? false };
        if (opts.interval && !["morning", "midday", "evening"].includes(opts.interval)) {
          fail("interval must be morning, midday, or evening.", ctx);
        }
        if (
          opts.cadence &&
          !["daily", "weekdays", "weekly", "interval"].includes(opts.cadence)
        ) {
          fail("cadence must be daily, weekdays, weekly, or interval.", ctx);
        }
        if (opts.weekday && !WEEKDAYS.includes(opts.weekday.toLowerCase())) {
          fail("weekday must be mon, tue, wed, thu, fri, sat, or sun.", ctx);
        }
        const body: Record<string, unknown> = { name };
        if (opts.lensId ?? readConfig()?.lensId) {
          body.lensId = opts.lensId ?? readConfig()?.lensId;
        }
        if (opts.interval) body.interval = opts.interval.toLowerCase();
        if (opts.cadence) body.cadence = opts.cadence.toLowerCase();
        if (opts.weekday) body.weekday = opts.weekday.toLowerCase();
        if (opts.every) body.intervalDays = opts.every;
        if (opts.guidance) body.guidance = opts.guidance;
        if (opts.benefit) body.benefit = opts.benefit;
        if (opts.goal) body.goalId = opts.goal;
        const result = await request<{ ritual: RitualRow }>("/api/cli/ritual/create", {
          method: "POST",
          body,
        });
        emit(
          result,
          () => {
            const r = result.ritual;
            process.stdout.write(
              `Created ritual '${r.name}' · ${r.interval.toLowerCase()} · ${cadenceLabel(r)}.\n`,
            );
            process.stdout.write(chalk.gray(`${r.id}\n`));
          },
          ctx,
        );
      },
    );

  ritual
    .command("update <id>")
    .description("edit a ritual (absent fields stay)")
    .option("--name <text>", "new name")
    .option("--interval <slot>", "morning | midday | evening")
    .option("--cadence <kind>", "daily | weekdays | weekly | interval")
    .option("--weekday <day>", "mon..sun (weekly cadence)")
    .option("--every <days>", "every N days, 2-365 (interval cadence)")
    .option("--guidance <text>", "what you do (markdown; pass '' to clear)")
    .option("--benefit <text>", "what you get (markdown; pass '' to clear)")
    .option("--goal <id>", "link to a goal (pass '' to clear)")
    .option("--json", "emit JSON output")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          interval?: string;
          cadence?: string;
          weekday?: string;
          every?: string;
          guidance?: string;
          benefit?: string;
          goal?: string;
          json?: boolean;
        },
      ) => {
        const ctx: OutputCtx = { json: opts.json ?? false };
        const body: Record<string, unknown> = { id };
        if (opts.name) body.name = opts.name;
        if (opts.interval) body.interval = opts.interval.toLowerCase();
        if (opts.cadence) body.cadence = opts.cadence.toLowerCase();
        if (opts.weekday) body.weekday = opts.weekday.toLowerCase();
        if (opts.every) body.intervalDays = opts.every;
        // Present-but-empty clears the definition field (null semantics).
        if (opts.guidance !== undefined) body.guidance = opts.guidance || null;
        if (opts.benefit !== undefined) body.benefit = opts.benefit || null;
        if (opts.goal !== undefined) body.goalId = opts.goal || null;
        const result = await request<{ ritual: RitualRow }>("/api/cli/ritual/update", {
          method: "POST",
          body,
        });
        emit(
          result,
          () => {
            process.stdout.write(`Updated ritual '${result.ritual.name}'.\n`);
          },
          ctx,
        );
      },
    );

  ritual
    .command("check <id>")
    .description("check off today (optional mood + note)")
    .option("--mood <mood>", "good | okay | rough")
    .option("--note <text>", "a short note")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { mood?: string; note?: string; json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      if (opts.mood && !["good", "okay", "rough"].includes(opts.mood)) {
        fail("mood must be good, okay, or rough.", ctx);
      }
      const body: Record<string, unknown> = { id };
      if (opts.mood) body.mood = opts.mood.toLowerCase();
      if (opts.note) body.note = opts.note;
      const result = await request<{ ritual: { id: string }; entry: { localDate: string; mood: string | null; note: string | null } }>(
        "/api/cli/ritual/check",
        { method: "POST", body },
      );
      emit(
        result,
        () => {
          const mood = result.entry.mood ? ` (${result.entry.mood.toLowerCase()})` : "";
          process.stdout.write(`Checked off for ${result.entry.localDate}${mood}.\n`);
        },
        ctx,
      );
    });

  ritual
    .command("uncheck <id>")
    .description("undo today's check (deletes the entry, reflection included)")
    .option("--json", "emit JSON output")
    .action(async (id: string, opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ ok: boolean }>("/api/cli/ritual/uncheck", {
        method: "POST",
        body: { id },
      });
      emit(result, () => {
        process.stdout.write("Unchecked.\n");
      }, ctx);
    });

  const lifecycle = (
    name: "pause" | "resume" | "archive" | "restore",
    description: string,
    human: string,
  ) => {
    ritual
      .command(`${name} <id>`)
      .description(description)
      .option("--json", "emit JSON output")
      .action(async (id: string, opts: { json?: boolean }) => {
        const ctx: OutputCtx = { json: opts.json ?? false };
        const result = await request<{ ritual: RitualRow; status: string }>(
          `/api/cli/ritual/${name}`,
          { method: "POST", body: { id } },
        );
        emit(
          result,
          () => {
            process.stdout.write(`${human} '${result.ritual.name}'.\n`);
          },
          ctx,
        );
      });
  };
  lifecycle("pause", "hide from due-ness without deleting history", "Paused");
  lifecycle("resume", "bring a paused ritual back", "Resumed");
  lifecycle("archive", "retire it (history stays; see 'ritual archived')", "Archived");
  lifecycle("restore", "un-retire an archived ritual", "Restored");

  ritual
    .command("archived")
    .description("list retired rituals (the 'ritual restore' targets)")
    .option("--json", "emit JSON output")
    .action(async (opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const result = await request<{ rituals: RitualRow[] }>("/api/cli/ritual/archived");
      emit(
        result,
        () => {
          if (result.rituals.length === 0) {
            process.stdout.write("No archived rituals.\n");
            return;
          }
          result.rituals.forEach((r, i) => {
            process.stdout.write(
              `  ${chalk.gray(`${i + 1}.`)} ${r.name} ${chalk.gray(`· ${r.interval.toLowerCase()} · ${cadenceLabel(r)}`)} ${chalk.gray(r.id)}\n`,
            );
          });
        },
        ctx,
      );
    });

  return ritual;
}
