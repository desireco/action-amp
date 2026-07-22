/**
 * Tests for the stats command.
 *
 * Unit-level: mocks the `request` function. Asserts the --json shape (raw
 * result object) and the human formatted block (padded keys + the derived
 * completed% annotation).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-admin-stats-test-${process.pid}-${Date.now()}`) };
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
let stderrBuf = "";
const origOut = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);
const origExit = process.exit.bind(process);

beforeEach(() => {
  stdoutBuf = "";
  stderrBuf = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutBuf += chunk.toString();
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderrBuf += chunk.toString();
    return true;
  };
});
afterEach(() => {
  process.stdout.write = origOut;
  process.stderr.write = origErr;
});

const { writeConfig, getConfigPath } = await import("../config.js");
const { makeStatsCommand } = await import("./stats.js");

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let exitCode: number | null = null;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}`);
  }) as typeof process.exit;
  const cmd = makeStatsCommand();
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors + fail()'s process.exit
  }
  return { stdout: stdoutBuf, stderr: stderrBuf, exitCode };
}

const SAMPLE_STATS = {
  stats: {
    users: { total: 100, signedUpToday: 3, signedUp7d: 12, signedUp30d: 40, activeToday: 5, active7d: 20, active30d: 50 },
    tasks: { created7d: 80, completed7d: 40, total: 500 },
    feedback: { byStatus: { OPEN: 4, IN_PROGRESS: 1, RESOLVED: 10, CLOSED: 2 }, total: 17 },
  },
};

describe("stats command", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
    process.exit = origExit;
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it("fetches /api/cli/admin/stats and prints formatted output by default", async () => {
    requestMock.mockResolvedValue(SAMPLE_STATS);
    const { stdout, exitCode } = await runCommand([]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/admin/stats", undefined);
    expect(stdout).toContain("Users");
    expect(stdout).toContain("total:           100");
    expect(stdout).toContain("completed:       40  (50% of created)");
    expect(exitCode).toBeNull();
  });

  it("--json emits the raw result object to stdout", async () => {
    requestMock.mockResolvedValue(SAMPLE_STATS);
    const { stdout } = await runCommand(["--json"]);
    expect(stdout.trim()).toBe(JSON.stringify(SAMPLE_STATS));
  });
});
