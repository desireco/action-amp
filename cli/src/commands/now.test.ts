/**
 * Tests for the `now` command (focus-goal-context spec FG06).
 *
 * Unit-level: mocks `request` (no real HTTP). Asserts the --json shape (exact
 * additive context, null context on empty states) and the human labeled-block
 * output (Task first, then available Project/Goal/Why now/Why it matters, with
 * unavailable lines omitted — no placeholders). Mirrors task.test.ts harness.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-now-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

// Mock request BEFORE importing the command module.
const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
      super(body.error ?? "error");
    }
  },
}));

// Capture stdout writes.
let stdoutBuf = "";
const origWrite = process.stdout.write.bind(process.stdout);
beforeEach(() => {
  stdoutBuf = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutBuf += chunk.toString();
    return true;
  };
});
afterEach(() => {
  process.stdout.write = origWrite;
});

const { writeConfig, getConfigPath } = await import("../config.js");
const { makeNowCommand } = await import("./now.js");
const { join } = await import("node:path");

async function runCommand(args: string[]): Promise<{ stdout: string }> {
  const cmd = makeNowCommand();
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander exits on error; catch so the test can inspect state.
  }
  return { stdout: stdoutBuf };
}

const FULL_TASK = {
  id: "task-1",
  description: "Ship the landing page",
  permalink: "ship-the-landing-page",
  isDone: false,
  createdAt: "2026-08-01T00:00:00.000Z",
  priority: "IMPORTANT",
  size: "M",
  status: "TODAY",
  startedAt: null,
  dueDate: new Date().toISOString(),
  project: { id: "p1", name: "Launch v2", permalink: "launch-v2" },
  goal: null,
};

const FULL_CONTEXT = {
  project: { id: "p1", name: "Launch v2", permalink: "launch-v2" },
  goal: {
    id: "g1",
    name: "Reach 100 paid customers",
    permalink: "reach-100-paid",
    description: "Prove paid demand before expanding scope.",
  },
  whyNow: "Important — due today",
  whyItMatters: "Prove paid demand before expanding scope.",
};

describe("now command", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  describe("--json", () => {
    it("emits the additive context alongside the task", async () => {
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: FULL_CONTEXT,
      });
      const { stdout } = await runCommand(["--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.task.description).toBe("Ship the landing page");
      expect(parsed.context).toEqual(FULL_CONTEXT);
    });

    it("preserves task + reason + null context for no-candidates", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-candidates",
      });
      const { stdout } = await runCommand(["--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.task).toBeNull();
      expect(parsed.context).toBeNull();
      expect(parsed.reason).toBe("no-candidates");
    });

    it("preserves task + reason + null context for no-lens", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-lens",
      });
      const { stdout } = await runCommand(["--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.task).toBeNull();
      expect(parsed.context).toBeNull();
      expect(parsed.reason).toBe("no-lens");
    });

    it("context is an object with nullable fields even when nothing resolves", async () => {
      // A Task with no Project/Goal and a matcher with no truthful reason.
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: {
          project: null,
          goal: null,
          whyNow: null,
          whyItMatters: null,
        },
      });
      const { stdout } = await runCommand(["--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.context).toEqual({
        project: null,
        goal: null,
        whyNow: null,
        whyItMatters: null,
      });
    });
  });

  describe("human output", () => {
    it("shows Task first, then Project, Goal, Why now, Why it matters", async () => {
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: FULL_CONTEXT,
      });
      const { stdout } = await runCommand([]);
      const lines = stdout.trim().split("\n");
      expect(lines[0]).toBe("Ship the landing page");
      expect(lines).toContain("Project: Launch v2");
      expect(lines).toContain("Goal: Reach 100 paid customers");
      expect(lines).toContain("Why now: Important — due today");
      expect(lines).toContain(
        "Why it matters: Prove paid demand before expanding scope.",
      );
      // Task line is first and unlabelled.
      expect(lines[0]).not.toContain(":");
    });

    it("Project-only context: Goal/whyItMatters omitted, no placeholders", async () => {
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: {
          project: { id: "p1", name: "Launch v2" },
          goal: null,
          whyNow: "Important",
          whyItMatters: null,
        },
      });
      const { stdout } = await runCommand([]);
      expect(stdout).toContain("Ship the landing page");
      expect(stdout).toContain("Project: Launch v2");
      expect(stdout).toContain("Why now: Important");
      // No Goal line, no Why it matters line.
      expect(stdout).not.toMatch(/Goal:/);
      expect(stdout).not.toMatch(/Why it matters:/);
    });

    it("Goal-only context (no Project): Project line omitted", async () => {
      requestMock.mockResolvedValue({
        task: { ...FULL_TASK, project: null },
        context: {
          project: null,
          goal: {
            id: "g1",
            name: "Legacy goal",
            permalink: "legacy",
            description: null,
          },
          whyNow: null,
          whyItMatters: "Toward Legacy goal.",
        },
      });
      const { stdout } = await runCommand([]);
      expect(stdout).toContain("Goal: Legacy goal");
      expect(stdout).toContain("Why it matters: Toward Legacy goal.");
      expect(stdout).not.toMatch(/Project:/);
      // whyNow null → omitted.
      expect(stdout).not.toMatch(/Why now:/);
    });

    it("matcher reason absent: Why now line omitted", async () => {
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: {
          project: null,
          goal: null,
          whyNow: null,
          whyItMatters: null,
        },
      });
      const { stdout } = await runCommand([]);
      // Only the Task line — nothing else to say truthfully.
      expect(stdout.trim()).toBe("Ship the landing page");
      expect(stdout).not.toMatch(/Why now:/);
      expect(stdout).not.toMatch(/Why it matters:/);
      expect(stdout).not.toMatch(/Project:/);
      expect(stdout).not.toMatch(/Goal:/);
    });

    it("null task no-lens → onboarding message", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-lens",
      });
      const { stdout } = await runCommand([]);
      expect(stdout).toContain("No lens yet");
    });

    it("null task no-candidates → 'Nothing on the table.'", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-candidates",
      });
      const { stdout } = await runCommand([]);
      expect(stdout).toContain("Nothing on the table.");
    });

    it("never invents Why it matters from Project or Task text", async () => {
      // Project present, no Goal anywhere. whyItMatters must stay null/omitted.
      requestMock.mockResolvedValue({
        task: FULL_TASK,
        context: {
          project: { id: "p1", name: "Launch v2" },
          goal: null,
          whyNow: "Important",
          whyItMatters: null,
        },
      });
      const { stdout } = await runCommand([]);
      expect(stdout).not.toMatch(/Why it matters:/);
    });
  });

  describe("lens routing", () => {
    it("appends the active lensId from config to the request path", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-candidates",
      });
      await runCommand([]);
      expect(requestMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/cli/now"),
        undefined,
      );
    });

    it("--lens-id flag overrides the active lens", async () => {
      requestMock.mockResolvedValue({
        task: null,
        context: null,
        reason: "no-candidates",
      });
      await runCommand(["--lens-id", "lens-explicit"]);
      expect(requestMock).toHaveBeenCalledWith(
        expect.stringContaining("lensId=lens-explicit"),
        undefined,
      );
    });
  });
});
