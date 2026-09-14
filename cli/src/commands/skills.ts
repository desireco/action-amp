/**
 * skills — install bundled ActionAmp agent skills into AI harnesses.
 *
 * `skills list` shows what's bundled. `skills install` copies skill folders
 * into every detected harness (pi, Claude Code, Codex, ~/.agents), asking
 * per harness when interactive. Copies only — end users have no repo
 * checkout to symlink back to. `_shared/` (guardrails every SKILL.md links
 * to) is copied alongside the skills, though it is never listed as one.
 */
import { Command } from "commander";
import {
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync,
  rmSync,
  cpSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { emit, fail, type OutputCtx } from "../output.js";

export interface SkillMeta {
  /** Frontmatter name (the skill's invocation id). */
  name: string;
  /** Frontmatter description (first line, unfolded). */
  description: string;
  /** Directory name inside the skills folder. */
  dir: string;
}

export interface Harness {
  key: string;
  label: string;
  /** Harness root whose presence means "installed" (e.g. ~/.claude). */
  detectDir: string;
  /** Where skill folders go (e.g. ~/.claude/skills). */
  skillsDir: string;
}

export interface SkillsDeps {
  /** Override bundled-skills resolution (tests). */
  resolveSkillsDir?: () => string;
  /** Override harness discovery (tests). */
  detectHarnesses?: (home: string) => Harness[];
  /** Override TTY detection (tests). */
  isInteractive?: () => boolean;
  /** Override the yes/no prompt (tests). */
  ask?: (question: string) => Promise<boolean>;
}

/** Parse minimal YAML frontmatter: name plus a single- or multi-line description. */
export function parseSkillFile(dir: string, file: string): SkillMeta | null {
  let text: string;
  try {
    text = readFileSync(join(dir, file), "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return null;
  let name = "";
  let description = "";
  let inDescription = false;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    const nameMatch = line.match(/^name:\s*(.+)$/);
    if (nameMatch) {
      name = nameMatch[1].trim();
      inDescription = false;
      continue;
    }
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      const rest = descMatch[1].trim();
      // Folded (>) or literal (|) block scalars continue on indented lines.
      inDescription = rest === ">" || rest === ">-" || rest === "|" || rest === "|-";
      if (!inDescription && rest) description = rest;
      continue;
    }
    if (inDescription && /^\s+\S/.test(line)) {
      const chunk = line.trim();
      if (description) description += " ";
      description += chunk;
    } else if (line.trim() && !/^\s/.test(line)) {
      inDescription = false;
    }
  }
  if (!name || !description) return null;
  return { name, description, dir };
}

/** List bundled skills: every directory with a parseable SKILL.md. */
export function listBundledSkills(skillsDir: string): SkillMeta[] {
  const out: SkillMeta[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const meta = parseSkillFile(join(skillsDir, entry.name), "SKILL.md");
    if (meta) out.push(meta);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Default harness table: presence of the root dir means "installed here". */
export function detectHarnesses(home: string): Harness[] {
  const table: Array<[string, string, string]> = [
    ["pi", "pi", join(home, ".pi", "agent", "skills")],
    ["claude", "Claude Code", join(home, ".claude", "skills")],
    ["codex", "Codex", join(home, ".codex", "skills")],
    ["agents", "~/.agents (shared)", join(home, ".agents", "skills")],
  ];
  return table
    .map(([key, label, skillsDir]) => ({
      key,
      label,
      detectDir: dirname(skillsDir),
      skillsDir,
    }))
    .filter((h) => existsSync(h.detectDir));
}

/**
 * Bundled skills location. Order:
 * 1. ACTIONAMP_SKILLS_DIR (tests / power users)
 * 2. <repo>/skills — dev checkout (cli/src or cli/dist sit one level below cli/)
 * 3. <pkg>/skills — published npm layout (publish.sh copies skills/ in)
 */
export function resolveSkillsDir(): string {
  const env = process.env.ACTIONAMP_SKILLS_DIR;
  if (env) return env;
  // This file lives in <pkg>/src/commands or <pkg>/dist/commands → package root.
  const pkgRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const repo = join(pkgRoot, "..", "skills");
  if (existsSync(repo)) return repo;
  return join(pkgRoot, "skills");
}

function defaultIsInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

async function defaultAsk(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} `)).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export function makeSkillsCommand(deps: SkillsDeps = {}): Command {
  const resolveDir = deps.resolveSkillsDir ?? resolveSkillsDir;
  const detect = deps.detectHarnesses ?? detectHarnesses;
  const isInteractive = deps.isInteractive ?? defaultIsInteractive;
  const ask = deps.ask ?? defaultAsk;

  const cmd = new Command("skills");
  cmd.description("agent skills: list and install into AI harnesses");

  const list = new Command("list");
  list
    .description("show bundled agent skills")
    .option("--json", "emit JSON output")
    .action((opts: { json?: boolean }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const source = resolveDir();
      if (!existsSync(source)) {
        fail("No bundled skills found.", ctx);
      }
      const skills = listBundledSkills(source);
      emit(
        { source, skills },
        () => {
          process.stdout.write(`Bundled skills (${source}):\n`);
          for (const s of skills) {
            process.stdout.write(`  ${s.name.padEnd(22)} ${s.description.split("\n")[0]}\n`);
          }
        },
        ctx,
      );
    });
  cmd.addCommand(list);

  const install = new Command("install");
  install
    .description("copy bundled agent skills into detected AI harnesses (pi, Claude Code, Codex, ~/.agents)")
    .option("--skill <name...>", "install only these skills (repeatable)")
    .option("--dir <path>", "install into this directory instead of detected harnesses")
    .option("--yes", "skip confirmation prompts (non-interactive default)")
    .option("--force", "overwrite already-installed skills")
    .option("--dry-run", "show what would happen, change nothing")
    .option("--json", "emit JSON output")
    .action(async (opts: {
      skill?: string[];
      dir?: string;
      yes?: boolean;
      force?: boolean;
      dryRun?: boolean;
      json?: boolean;
    }) => {
      const ctx: OutputCtx = { json: opts.json ?? false };
      const source = resolveDir();
      if (!existsSync(source)) {
        fail("No bundled skills found.", ctx);
      }
      const available = listBundledSkills(source);

      let selected = available;
      if (opts.skill && opts.skill.length > 0) {
        const unknown = opts.skill.filter((n) => !available.some((s) => s.name === n || s.dir === n));
        if (unknown.length > 0) {
          fail(
            `Unknown skill(s): ${unknown.join(", ")}. Available: ${available.map((s) => s.name).join(", ")}.`,
            ctx,
          );
        }
        selected = available.filter((s) => opts.skill!.includes(s.name) || opts.skill!.includes(s.dir));
      }
      if (selected.length === 0) {
        fail("No skills selected.", ctx);
      }

      let targets: Harness[];
      if (opts.dir) {
        targets = [{ key: "dir", label: opts.dir, detectDir: opts.dir, skillsDir: opts.dir }];
      } else {
        targets = detect(homedir());
        if (targets.length === 0) {
          fail("No AI harnesses detected (~/.pi, ~/.claude, ~/.codex, ~/.agents). Use --dir <path>.", ctx);
        }
        // Interactive: confirm each harness. Non-interactive: all detected.
        if (!opts.yes && !opts.dryRun && isInteractive()) {
          const chosen: Harness[] = [];
          for (const h of targets) {
            const ok = await ask(
              `Install ${selected.length} ActionAmp skill${selected.length === 1 ? "" : "s"} into ${h.label} (${h.skillsDir})? [Y/n]`,
            );
            if (ok) chosen.push(h);
          }
          if (chosen.length === 0) {
            emit({ installed: [], skipped: [], dryRun: false }, () => {
              process.stdout.write("Nothing installed.\n");
            }, ctx);
            return;
          }
          targets = chosen;
        }
      }

      // Every SKILL.md links its guardrails at ../_shared/rules.md, so
      // _shared/ travels with every install (it can't be selected via
      // --skill — listBundledSkills skips underscore-prefixed dirs).
      const hasShared = existsSync(join(source, "_shared"));

      const installed: Array<{ harness: string; dir: string; skills: string[] }> = [];
      const skipped: Array<{ harness: string; dir: string; skills: string[] }> = [];
      const planned: Array<{ harness: string; dir: string; skills: string[] }> = [];

      for (const h of targets) {
        if (opts.dryRun) {
          planned.push({
            harness: h.label,
            dir: h.skillsDir,
            skills: selected.map((s) => s.name).concat(hasShared ? ["_shared"] : []),
          });
          continue;
        }
        mkdirSync(h.skillsDir, { recursive: true });
        const doneNames: string[] = [];
        const skipNames: string[] = [];
        for (const s of selected) {
          const dest = join(h.skillsDir, basename(s.dir));
          if (existsSync(dest) && !opts.force) {
            skipNames.push(s.name);
            continue;
          }
          if (opts.force && existsSync(dest)) rmSync(dest, { recursive: true, force: true });
          cpSync(s.dir, dest, { recursive: true });
          doneNames.push(s.name);
        }
        if (hasShared) {
          const sharedSrc = join(source, "_shared");
          const sharedDest = join(h.skillsDir, "_shared");
          if (existsSync(sharedDest) && !opts.force) {
            skipNames.push("_shared");
          } else {
            if (opts.force && existsSync(sharedDest)) rmSync(sharedDest, { recursive: true, force: true });
            cpSync(sharedSrc, sharedDest, { recursive: true });
            doneNames.push("_shared");
          }
        }
        if (doneNames.length > 0) installed.push({ harness: h.label, dir: h.skillsDir, skills: doneNames });
        if (skipNames.length > 0) skipped.push({ harness: h.label, dir: h.skillsDir, skills: skipNames });
      }

      emit(
        { source, installed, skipped, dryRun: Boolean(opts.dryRun), planned },
        () => {
          if (opts.dryRun) {
            process.stdout.write("Dry run — would install:\n");
            for (const p of planned) {
              process.stdout.write(`  ${p.harness}: ${p.skills.join(", ")}\n`);
            }
            return;
          }
          for (const i of installed) {
            const n = i.skills.filter((name) => name !== "_shared").length;
            process.stdout.write(`Installed ${n} skill(s) into ${i.harness}: ${i.skills.join(", ")}\n`);
          }
          for (const s of skipped) {
            process.stdout.write(`Skipped (already present, use --force) in ${s.harness}: ${s.skills.join(", ")}\n`);
          }
          if (installed.length === 0 && skipped.length === 0) {
            process.stdout.write("Nothing installed.\n");
          }
        },
        ctx,
      );
    });
  cmd.addCommand(install);

  return cmd;
}
