/**
 * Tests for the skills command (list/install).
 * Unit-level: no API involved. Skills source and harness dirs are temp dirs;
 * homedir is mocked to a temp home so default detection never touches the
 * real one. Interactivity is injected via deps.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";
import type { SkillsDeps } from "./skills.js";

const { TMP, TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  const TMP = join(tmpdir(), `aa-skills-test-${process.pid}-${Date.now()}`);
  return { TMP, TMP_HOME: join(TMP, "home") };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

let stdoutBuf = "";
const origWrite = process.stdout.write.bind(process.stdout);
beforeEach(() => {
  stdoutBuf = "";
  process.exitCode = undefined as unknown as number;
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutBuf += chunk.toString();
    return true;
  };
});
afterEach(() => {
  process.stdout.write = origWrite;
  process.exitCode = undefined as unknown as number;
});

function makeSource() {
  const src = join(TMP, "src");
  mkdirSync(join(src, "alpha-skill"), { recursive: true });
  writeFileSync(
    join(src, "alpha-skill", "SKILL.md"),
    `---\nname: alpha-skill\ndescription: >\n  Does alpha things.\n  Use when the user mentions alpha.\n---\n\n# Alpha\n`,
  );
  mkdirSync(join(src, "beta-skill"), { recursive: true });
  writeFileSync(
    join(src, "beta-skill", "SKILL.md"),
    `---\nname: beta-skill\ndescription: Does beta things, single line.\n---\n\n# Beta\n`,
  );
  mkdirSync(join(src, "_shared"), { recursive: true });
  writeFileSync(join(src, "_shared", "rules.md"), "rules\n");
  writeFileSync(join(src, "README.md"), "# not a skill\n");
  return src;
}

function makeHome() {
  mkdirSync(join(TMP_HOME, ".pi", "agent"), { recursive: true });
  mkdirSync(join(TMP_HOME, ".claude"), { recursive: true });
}

const { parseSkillFile, listBundledSkills, makeSkillsCommand, detectHarnesses } =
  await import("./skills.js");

async function run(args: string[], deps: Partial<SkillsDeps> = {}) {
  const root = new Command();
  root.addCommand(makeSkillsCommand(deps));
  await root.parseAsync(args, { from: "user" });
}

/** fail() exits — stub it the task.test.ts way and report the code. */
async function runExpectExit(args: string[], deps: Partial<SkillsDeps> = {}): Promise<number | null> {
  let code: number | null = null;
  const origExit = process.exit.bind(process);
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error(`__exit_${code}`);
  }) as typeof process.exit;
  try {
    await run(args, deps);
  } catch {
    // fail()'s process.exit
  }
  process.exit = origExit;
  return code;
}

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  makeSource();
  makeHome();
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("parseSkillFile", () => {
  it("folds multi-line block descriptions", () => {
    const meta = parseSkillFile(join(TMP, "src"), "alpha-skill/SKILL.md")!;
    expect(meta).not.toBeNull();
    expect(meta.name).toBe("alpha-skill");
    expect(meta.description).toContain("Does alpha things.");
    expect(meta.description).toContain("Use when the user mentions alpha.");
  });

  it("rejects files without usable frontmatter", () => {
    expect(parseSkillFile(join(TMP, "src", "_shared"), "rules.md")).toBeNull();
  });
});

describe("listBundledSkills", () => {
  it("includes only directories with SKILL.md frontmatter", () => {
    const skills = listBundledSkills(join(TMP, "src"));
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha-skill", "beta-skill"]);
  });
});

describe("detectHarnesses", () => {
  it("finds harnesses present in the (temp) home", () => {
    const found = detectHarnesses(TMP_HOME);
    expect(found.map((h) => h.key).sort()).toEqual(["claude", "pi"]);
  });
});

describe("skills list", () => {
  it("prints JSON with source and skills", async () => {
    await run(["skills", "list", "--json"], { resolveSkillsDir: () => join(TMP, "src") });
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.source).toBe(join(TMP, "src"));
    expect(parsed.skills).toHaveLength(2);
  });

  it("errors when the source dir is missing", async () => {
    const code = await runExpectExit(["skills", "list", "--json"], {
      resolveSkillsDir: () => join(TMP, "nope"),
    });
    expect(JSON.parse(stdoutBuf).error).toContain("No bundled skills");
    expect(code).toBe(1);
  });
});

describe("skills install", () => {
  it("installs into all detected harnesses when non-interactive", async () => {
    await run(["skills", "install", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => false,
    });
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills", "alpha-skill", "SKILL.md"))).toBe(true);
    expect(existsSync(join(TMP_HOME, ".claude", "skills", "beta-skill", "SKILL.md"))).toBe(true);
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.installed).toHaveLength(2);
    expect(parsed.dryRun).toBe(false);
  });

  it("skips existing skills unless --force", async () => {
    // Only Claude Code in this scenario, so index-based assertions are stable.
    rmSync(join(TMP_HOME, ".pi"), { recursive: true, force: true });
    const dest = join(TMP_HOME, ".claude", "skills", "alpha-skill");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "SKILL.md"), "old content");
    const deps: SkillsDeps = {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => false,
    };
    await run(["skills", "install", "--json"], deps);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("old content");
    let parsed = JSON.parse(stdoutBuf);
    expect(parsed.skipped[0].skills).toEqual(["alpha-skill"]);

    stdoutBuf = "";
    await run(["skills", "install", "--force", "--json"], deps);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("name: alpha-skill");
    parsed = JSON.parse(stdoutBuf);
    expect(parsed.installed[0].skills).toContain("alpha-skill");
  });

  it("installs a subset with --skill", async () => {
    await run(["skills", "install", "--skill", "beta-skill", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => false,
    });
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills", "beta-skill"))).toBe(true);
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills", "alpha-skill"))).toBe(false);
  });

  it("installs into an explicit --dir", async () => {
    const dir = join(TMP, "custom");
    await run(["skills", "install", "--dir", dir, "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
    });
    expect(existsSync(join(dir, "alpha-skill", "SKILL.md"))).toBe(true);
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.installed[0].harness).toBe(dir);
  });

  it("errors on unknown skill names", async () => {
    const code = await runExpectExit(["skills", "install", "--skill", "nope", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => false,
    });
    expect(JSON.parse(stdoutBuf).error).toContain("Unknown skill");
    expect(code).toBe(1);
  });

  it("installs nothing when every interactive answer is no", async () => {
    await run(["skills", "install", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => true,
      ask: async () => false,
    });
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills"))).toBe(false);
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.installed).toEqual([]);
  });

  it("installs only into harnesses the user confirms", async () => {
    const answers: Record<string, boolean> = { pi: true, "Claude Code": false };
    await run(["skills", "install", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => true,
      ask: async (q) => (q.includes(" into pi ") ? answers.pi : answers["Claude Code"]),
    });
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills", "alpha-skill"))).toBe(true);
    expect(existsSync(join(TMP_HOME, ".claude", "skills"))).toBe(false);
  });

  it("dry-run changes nothing", async () => {
    await run(["skills", "install", "--dry-run", "--json"], {
      resolveSkillsDir: () => join(TMP, "src"),
      isInteractive: () => false,
    });
    expect(existsSync(join(TMP_HOME, ".pi", "agent", "skills"))).toBe(false);
    const parsed = JSON.parse(stdoutBuf);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.planned[0].skills).toHaveLength(2);
  });
});
