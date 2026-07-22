/**
 * Tests for the today command.
 *
 * Unit-level: mocks the `request` function. Asserts --json shape, human output,
 * empty-list messages, --done variant.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-today-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
      super(body.error ?? "error");
    }
  },
}));

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
const { makeTodayCommand } = await import("./today.js");

async function runCommand(args: string[]): Promise<{ stdout: string }> {
  const cmd = makeTodayCommand();
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors
  }
  return { stdout: stdoutBuf };
}

const TODAY_TASKS = [
  {
    id: "t1",
    description: "Ship the auth refactor",
    permalink: "ship-auth",
    isDone: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    priority: "IMPORTANT",
    size: "M",
    status: "TODAY",
    project: { id: "p1", name: "ProjectX" },
    goal: null,
  },
  {
    id: "t2",
    description: "Review Maria's PR",
    permalink: "review-pr",
    isDone: false,
    createdAt: "2026-07-02T00:00:00.000Z",
    priority: "NORMAL",
    size: "S",
    status: "TODAY",
    project: null,
    goal: null,
  },
];

describe("today command", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it("--json emits the tasks array", async () => {
    requestMock.mockResolvedValue({ tasks: TODAY_TASKS });
    const { stdout } = await runCommand(["--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].description).toBe("Ship the auth refactor");
  });

  it("human output lists numbered tasks", async () => {
    requestMock.mockResolvedValue({ tasks: TODAY_TASKS });
    const { stdout } = await runCommand([]);
    expect(stdout).toContain("Ship the auth refactor");
    expect(stdout).toContain("Review Maria's PR");
    expect(stdout).toContain("ProjectX");
  });

  it("calls /api/cli/today for the open list", async () => {
    requestMock.mockResolvedValue({ tasks: [] });
    await runCommand([]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/today", undefined);
  });

  it("--done calls /api/cli/today/done", async () => {
    requestMock.mockResolvedValue({ tasks: [TODAY_TASKS[0]!] });
    await runCommand(["--done"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/today/done", undefined);
  });

  it("--done shows completed tasks with a count header", async () => {
    requestMock.mockResolvedValue({ tasks: [TODAY_TASKS[0]!] });
    const { stdout } = await runCommand(["--done"]);
    expect(stdout).toContain("1 done:");
    expect(stdout).toContain("Ship the auth refactor");
  });

  it("empty open list → 'Nothing on Today.'", async () => {
    requestMock.mockResolvedValue({ tasks: [] });
    const { stdout } = await runCommand([]);
    expect(stdout).toContain("Nothing on Today.");
  });

  it("empty done list → 'Nothing done today.'", async () => {
    requestMock.mockResolvedValue({ tasks: [] });
    const { stdout } = await runCommand(["--done"]);
    expect(stdout).toContain("Nothing done today.");
  });
});
