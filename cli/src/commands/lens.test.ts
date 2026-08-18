/**
 * Tests for the lens command (list, show, switch, current).
 * Unit-level: mocks request() + a temp HOME (so config reads/writes don't
 * touch the real ~/.config/actionamp). Same harness as management.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return {
    TMP_HOME: join(tmpdir(), `aa-lens-test-${process.pid}-${Date.now()}`),
  };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

const requestMock = vi.fn();
vi.mock("../api.js", () => ({
  request: (path: string, init?: unknown) => requestMock(path, init),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public body: { error?: string } & Record<string, unknown>,
    ) {
      super(body.error ?? "error");
    }
  },
}));

let stdoutBuf = "";
let stderrBuf = "";
const origOut = process.stdout.write.bind(process.stdout);
const origErr = process.stderr.write.bind(process.stderr);
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

const { writeConfig, readConfig, getConfigPath } = await import("../config.js");
const { makeLensCommand } = await import("./lens.js");

async function run(cmd: Command, args: string[]) {
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors (e.g. process.exit from fail())
  }
  return { stdout: stdoutBuf, stderr: stderrBuf };
}

beforeEach(() => {
  mkdirSync(join(getConfigPath(), ".."), { recursive: true });
  writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
  requestMock.mockReset();
});
afterEach(() => {
  rmSync(TMP_HOME, { recursive: true, force: true });
});

const LENS_ME = {
  id: "l1",
  name: "Me",
  color: null,
  purpose: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  counts: { goals: 0, projects: 0, tasks: 2 },
};
const LENS_WORK = {
  id: "l2",
  name: "Work",
  color: "indigo",
  purpose: "Day job",
  createdAt: "2026-07-02T00:00:00.000Z",
  counts: { goals: 1, projects: 3, tasks: 12 },
};

describe("lens list", () => {
  it("calls GET /api/cli/lens/list with no query", async () => {
    requestMock.mockResolvedValue({ lenses: [] });
    await run(makeLensCommand(), ["list"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/lens/list", undefined);
  });

  it("human output names each lens with purpose", async () => {
    requestMock.mockResolvedValue({ lenses: [LENS_ME, LENS_WORK] });
    const { stdout } = await run(makeLensCommand(), ["list"]);
    expect(stdout).toContain("Me");
    // The type label was removed 2026-08-18 — every lens is a life area now
    // (simple lists are a Project type).
    expect(stdout).not.toContain("life area");
    expect(stdout).toContain("Work");
    expect(stdout).toContain("Day job");
  });

  it("marks the active lens (matches config.lensId)", async () => {
    writeConfig({
      token: "aa_test",
      apiUrl: "http://localhost:3001",
      lensId: "l2",
    });
    requestMock.mockResolvedValue({ lenses: [LENS_ME, LENS_WORK] });
    const { stdout } = await run(makeLensCommand(), ["list"]);
    // The Work row carries the active marker; the Me row does not.
    const workLine = stdout.split("\n").find((l) => l.includes("Work")) ?? "";
    const meLine =
      stdout.split("\n").find((l) => l.includes("Me") && !l.includes("Work")) ??
      "";
    expect(workLine).toContain("← active");
    expect(meLine).not.toContain("← active");
  });

  it("empty → 'No lenses.'", async () => {
    requestMock.mockResolvedValue({ lenses: [] });
    const { stdout } = await run(makeLensCommand(), ["list"]);
    expect(stdout).toContain("No lenses.");
  });

  it("--json emits the array untouched", async () => {
    requestMock.mockResolvedValue({ lenses: [LENS_ME] });
    const { stdout } = await run(makeLensCommand(), ["list", "--json"]);
    expect(JSON.parse(stdout).lenses).toHaveLength(1);
    expect(JSON.parse(stdout).lenses[0].id).toBe("l1");
  });
});

describe("lens show", () => {
  it("calls GET /api/cli/lens/show?idOrName=<enc>", async () => {
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    await run(makeLensCommand(), ["show", "Work"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/lens/show?idOrName=Work",
      undefined,
    );
  });

  it("URL-encodes the idOrName", async () => {
    requestMock.mockResolvedValue({ lens: null });
    await run(makeLensCommand(), ["show", "Side Hustle"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/lens/show?idOrName=Side%20Hustle",
      undefined,
    );
  });

  it("human output shows name, purpose, counts, id", async () => {
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    const { stdout } = await run(makeLensCommand(), ["show", "Work"]);
    expect(stdout).toContain("Work");
    expect(stdout).not.toContain("life area");
    expect(stdout).toContain("Day job");
    expect(stdout).toContain("12 tasks");
    expect(stdout).toContain("3 projects");
    expect(stdout).toContain("1 goal");
    expect(stdout).toContain("l2");
  });

  it("null → 'No such lens.'", async () => {
    requestMock.mockResolvedValue({ lens: null });
    const { stdout } = await run(makeLensCommand(), ["show", "nope"]);
    expect(stdout).toContain("No such lens.");
  });

  it("marks the lens as active when it matches config.lensId", async () => {
    writeConfig({
      token: "aa_test",
      apiUrl: "http://localhost:3001",
      lensId: "l2",
    });
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    const { stdout } = await run(makeLensCommand(), ["show", "l2"]);
    expect(stdout).toContain("(active)");
  });
});

describe("lens switch", () => {
  it("resolves by name and writes the id to config", async () => {
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    const { stdout } = await run(makeLensCommand(), ["switch", "Work"]);
    expect(stdout).toContain("Switched to 'Work'.");
    expect(readConfig()?.lensId).toBe("l2");
  });

  it("--json emits { ok, id, name }", async () => {
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    const { stdout } = await run(makeLensCommand(), [
      "switch",
      "Work",
      "--json",
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual({
      ok: true,
      id: "l2",
      name: "Work",
    });
  });

  it("not-found → human error on stderr, exit 1, no config write", async () => {
    requestMock.mockResolvedValue({ lens: null });
    const { stderr, stdout } = await run(makeLensCommand(), [
      "switch",
      "Ghost",
    ]);
    expect(stderr).toContain("error:");
    expect(stderr).toContain("No such lens.");
    expect(stdout).not.toContain("Switched");
    expect(readConfig()?.lensId).toBeUndefined();
  });

  it("not-found --json → { error } on stdout, no config write", async () => {
    requestMock.mockResolvedValue({ lens: null });
    const { stdout } = await run(makeLensCommand(), [
      "switch",
      "Ghost",
      "--json",
    ]);
    expect(JSON.parse(stdout).error).toBe("No such lens.");
    expect(readConfig()?.lensId).toBeUndefined();
  });
});

describe("lens current", () => {
  it("no active lens → 'No active lens.'", async () => {
    const { stdout } = await run(makeLensCommand(), ["current"]);
    expect(stdout).toContain("No active lens");
  });

  it("no active lens --json → { lens: null }", async () => {
    const { stdout } = await run(makeLensCommand(), ["current", "--json"]);
    expect(JSON.parse(stdout)).toEqual({ lens: null });
  });

  it("active lens set → fetches it by id and prints name", async () => {
    writeConfig({
      token: "aa_test",
      apiUrl: "http://localhost:3001",
      lensId: "l2",
    });
    requestMock.mockResolvedValue({ lens: LENS_WORK });
    const { stdout } = await run(makeLensCommand(), ["current"]);
    expect(requestMock).toHaveBeenCalledWith(
      "/api/cli/lens/show?idOrName=l2",
      undefined,
    );
    expect(stdout).toContain("Work");
  });

  it("active lens id no longer resolves → 'was deleted'", async () => {
    writeConfig({
      token: "aa_test",
      apiUrl: "http://localhost:3001",
      lensId: "stale",
    });
    requestMock.mockResolvedValue({ lens: null });
    const { stdout } = await run(makeLensCommand(), ["current"]);
    expect(stdout).toContain("deleted");
  });
});
