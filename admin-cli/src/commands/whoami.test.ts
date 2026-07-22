/**
 * Tests for the whoami command.
 *
 * The login non-admin rejection is hard to unit-test (localhost callback
 * server), so this covers the same `isAdmin` field via the defensive branch in
 * whoami: if a non-admin token ever lands in config, whoami flags it loudly
 * instead of silently looking fine. The login-time gate itself is verified by
 * the curl e2e (the 403 path on the feedback routes).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-admin-whoami-test-${process.pid}-${Date.now()}`) };
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
const { makeWhoamiCommand } = await import("./whoami.js");

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let exitCode: number | null = null;
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit_${exitCode}`);
  }) as typeof process.exit;
  const cmd = makeWhoamiCommand();
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors + fail()'s process.exit
  }
  return { stdout: stdoutBuf, stderr: stderrBuf, exitCode };
}

describe("whoami command", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    requestMock.mockReset();
    process.exit = origExit;
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it("calls /api/cli/whoami and prints admin: yes for an admin", async () => {
    requestMock.mockResolvedValue({
      user: { id: "u1", email: "admin@x.com", fullName: "Admin", plan: "FOUNDER", isAdmin: true },
    });
    const { stdout } = await runCommand([]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/whoami", undefined);
    expect(stdout).toContain("admin@x.com");
    expect(stdout).toContain("admin: yes");
  });

  it("--json emits the user object", async () => {
    requestMock.mockResolvedValue({
      user: { id: "u1", email: "admin@x.com", fullName: "Admin", plan: "FOUNDER", isAdmin: true },
    });
    const { stdout } = await runCommand(["--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.user.isAdmin).toBe(true);
  });

  it("rejects loudly if the stored token is somehow not an admin", async () => {
    requestMock.mockResolvedValue({
      user: { id: "u1", email: "user@x.com", fullName: "User", plan: "FREE", isAdmin: false },
    });
    const { exitCode, stderr } = await runCommand([]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not an admin");
  });
});
