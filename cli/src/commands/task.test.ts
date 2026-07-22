/**
 * Tests for the task commands.
 *
 * Unit-level: mocks the `request` function from api.ts (so no real HTTP, no
 * subprocess, no msw needed for these). Asserts the --json shape + human output
 * + error handling of each command's handler.
 *
 * The handler functions are tested directly by calling them with mock args;
 * commander's arg parsing is exercised separately by the smoke test in
 * index.test.ts (a future slice).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-task-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

// Mock request BEFORE importing the command module
const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
      super(body.error ?? "error");
    }
  },
}));

// Capture stdout writes
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
const { makeTaskCommand } = await import("./task.js");

async function runCommand(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  const cmd = makeTaskCommand();
  // commander's parseAsync reads process.argv; use parse(args, {from: "user"}) instead
  exitCode = 0;
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander exits on error; we catch so the test can inspect state
  }
  return { stdout: stdoutBuf, exitCode };
}

let exitCode = 0;

const TASK = {
  id: "task-1",
  description: "Ship the auth refactor",
  permalink: "ship-the-auth-refactor",
  isDone: false,
  createdAt: "2026-07-01T00:00:00.000Z",
  priority: "IMPORTANT",
  size: "M",
  status: "TODAY",
  project: { id: "p1", name: "ProjectX" },
  goal: null,
};

describe("task commands", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  describe("task show", () => {
    it("--json emits the task JSON", async () => {
      requestMock.mockResolvedValue({ task: TASK });
      const { stdout } = await runCommand(["show", "task-1", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.task.description).toBe("Ship the auth refactor");
      expect(requestMock).toHaveBeenCalledWith(
        "/api/cli/task/show?id=task-1",
        undefined,
      );
    });

    it("human output includes the description + project", async () => {
      requestMock.mockResolvedValue({ task: TASK });
      const { stdout } = await runCommand(["show", "task-1"]);
      expect(stdout).toContain("Ship the auth refactor");
      expect(stdout).toContain("ProjectX");
    });

    it("null task → 'No such task.'", async () => {
      requestMock.mockResolvedValue({ task: null });
      const { stdout } = await runCommand(["show", "task-1"]);
      expect(stdout).toContain("No such task.");
    });
  });

  describe("task done", () => {
    it("--json emits the result", async () => {
      requestMock.mockResolvedValue({ id: "task-1", isDone: true, completedAt: "2026-07-22T00:00:00.000Z" });
      const { stdout } = await runCommand(["done", "task-1", "--json"]);
      const parsed = JSON.parse(stdout);
      expect(parsed.id).toBe("task-1");
      expect(parsed.isDone).toBe(true);
    });

    it("human output says 'Marked done.'", async () => {
      requestMock.mockResolvedValue({ id: "task-1", isDone: true });
      const { stdout } = await runCommand(["done", "task-1"]);
      expect(stdout).toContain("Marked done.");
    });

    it("passes --outcome in the body", async () => {
      requestMock.mockResolvedValue({ id: "task-1", isDone: true });
      await runCommand(["done", "task-1", "--outcome", "shipped it"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/task/done", {
        method: "POST",
        body: { id: "task-1", outcome: "shipped it" },
      });
    });

    it("without --outcome, body has only id", async () => {
      requestMock.mockResolvedValue({ id: "task-1", isDone: true });
      await runCommand(["done", "task-1"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/task/done", {
        method: "POST",
        body: { id: "task-1" },
      });
    });
  });

  describe("task start", () => {
    it("human output says 'Started.'", async () => {
      requestMock.mockResolvedValue({ id: "task-1", startedAt: "2026-07-22T00:00:00.000Z" });
      const { stdout } = await runCommand(["start", "task-1"]);
      expect(stdout).toContain("Started.");
    });
  });

  describe("task pause", () => {
    it("human output says 'Paused.'", async () => {
      requestMock.mockResolvedValue({ id: "task-1", startedAt: null });
      const { stdout } = await runCommand(["pause", "task-1"]);
      expect(stdout).toContain("Paused.");
    });
  });

  describe("task snooze", () => {
    it("default preset is tomorrow → 'Snoozed until'", async () => {
      requestMock.mockResolvedValue({ id: "task-1", status: "UPCOMING", dueDate: "2026-07-23T09:00:00.000Z" });
      const { stdout } = await runCommand(["snooze", "task-1"]);
      expect(stdout).toContain("Snoozed until");
    });

    it("--preset someday → 'Snoozed someday.'", async () => {
      requestMock.mockResolvedValue({ id: "task-1", status: "SOMEDAY", dueDate: null });
      const { stdout } = await runCommand(["snooze", "task-1", "--preset", "someday"]);
      expect(stdout).toContain("Snoozed someday.");
    });
  });

  describe("task move", () => {
    it("--to upcoming", async () => {
      requestMock.mockResolvedValue({ id: "task-1", status: "UPCOMING" });
      const { stdout } = await runCommand(["move", "task-1", "--to", "upcoming"]);
      expect(stdout).toContain("Moved to upcoming.");
    });

    it("passes the status uppercased in the body", async () => {
      requestMock.mockResolvedValue({ id: "task-1", status: "TODAY" });
      await runCommand(["move", "task-1", "--to", "today"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/task/move", {
        method: "POST",
        body: { id: "task-1", status: "TODAY" },
      });
    });
  });
});
