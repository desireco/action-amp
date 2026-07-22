/**
 * Tests for the feedback command.
 *
 * Unit-level: mocks the `request` function. Asserts --json shape, human output,
 * the client-side status validation, the list/show/status subcommands, and the
 * empty-list message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-admin-feedback-test-${process.pid}-${Date.now()}`) };
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
const { makeFeedbackCommand } = await import("./feedback.js");

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let exitCode: number | null = null;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}`);
  }) as typeof process.exit;
  const cmd = makeFeedbackCommand();
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors + fail()'s process.exit
  }
  return { stdout: stdoutBuf, stderr: stderrBuf, exitCode };
}

const ROW = {
  id: "fb-12345678-aaaa-bbbb-cccc-dddddddddddd",
  shortId: "ABCD-1234",
  createdAt: "2026-07-22T10:00:00.000Z",
  updatedAt: "2026-07-22T10:00:00.000Z",
  message: "Love the new What Now screen.",
  status: "OPEN",
  userId: "u1",
  userName: "Zeljko Dakic",
  userEmail: "zeljko@dakic.com",
  route: "/app",
  section: "work",
  lensId: "l1",
  lensName: "Work",
  lensColor: "indigo",
  userAgent: "Vitest",
};

describe("feedback command", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
    process.exit = origExit;
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  // ── list ────────────────────────────────────────────────────────────────
  it("list defaults to limit=10", async () => {
    requestMock.mockResolvedValue({ feedback: [ROW] });
    await runCommand(["list"]);
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=10"),
      undefined,
    );
  });

  it("list --json emits the feedback array", async () => {
    requestMock.mockResolvedValue({ feedback: [ROW] });
    const { stdout } = await runCommand(["list", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.feedback).toHaveLength(1);
    expect(parsed.feedback[0].message).toBe("Love the new What Now screen.");
  });

  it("list human output renders id, status, message, submitter", async () => {
    requestMock.mockResolvedValue({ feedback: [ROW] });
    const { stdout } = await runCommand(["list"]);
    expect(stdout).toContain("Love the new What Now screen.");
    expect(stdout).toContain("OPEN");
    expect(stdout).toContain("zeljko@dakic.com");
  });

  it("list --status passes the filter as a query param", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    await runCommand(["list", "--status", "RESOLVED"]);
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("status=RESOLVED"),
      undefined,
    );
  });

  it("list --status rejects an invalid status client-side", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    const { exitCode, stderr } = await runCommand(["list", "--status", "BOGUS"]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid status");
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("list empty → 'No feedback.'", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    const { stdout } = await runCommand(["list"]);
    expect(stdout).toContain("No feedback.");
  });

  it("list --limit <n> passes the cap as a query param", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    await runCommand(["list", "--limit", "5"]);
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=5"),
      undefined,
    );
  });

  it("list --limit all passes limit=all (unbounded)", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    await runCommand(["list", "--limit", "all"]);
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=all"),
      undefined,
    );
  });

  it("list --limit 0 is rejected client-side", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    const { exitCode } = await runCommand(["list", "--limit", "0"]);
    expect(exitCode).toBe(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("list --limit bogus is rejected client-side", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    const { exitCode } = await runCommand(["list", "--limit", "bogus"]);
    expect(exitCode).toBe(1);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("list combines --status and --limit", async () => {
    requestMock.mockResolvedValue({ feedback: [] });
    await runCommand(["list", "--status", "OPEN", "--limit", "all"]);
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("status=OPEN"),
      undefined,
    );
    expect(requestMock).toHaveBeenCalledWith(
      expect.stringContaining("limit=all"),
      undefined,
    );
  });

  // ── show ────────────────────────────────────────────────────────────────
  it("show calls /api/cli/feedback/show?id= and renders detail", async () => {
    requestMock.mockResolvedValue({ feedback: ROW });
    const { stdout } = await runCommand(["show", ROW.id]);
    expect(requestMock).toHaveBeenCalledWith(
      `/api/cli/feedback/show?id=${encodeURIComponent(ROW.id)}`,
      undefined,
    );
    expect(stdout).toContain("Love the new What Now screen.");
    expect(stdout).toContain("zeljko@dakic.com");
  });

  // ── status ──────────────────────────────────────────────────────────────
  it("status POSTs { id, status } and prints the new status", async () => {
    requestMock.mockResolvedValue({ feedback: { ...ROW, status: "IN_PROGRESS" } });
    const { stdout } = await runCommand(["status", ROW.id, "IN_PROGRESS"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/feedback/status", {
      method: "POST",
      body: { id: ROW.id, status: "IN_PROGRESS" },
    });
    expect(stdout).toContain("IN_PROGRESS");
  });

  it("status rejects an invalid value client-side", async () => {
    requestMock.mockResolvedValue({ feedback: ROW });
    const { exitCode } = await runCommand(["status", ROW.id, "BOGUS"]);
    expect(exitCode).toBe(1);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
