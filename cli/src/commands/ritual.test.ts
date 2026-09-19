/**
 * Tests for the ritual commands — the task.test.ts pattern: mocks `request`,
 * captures stdout, asserts --json shape + human output + validation errors.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `aa-ritual-test-${process.pid}-${Date.now()}`) };
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
const { makeRitualCommand } = await import("./ritual.js");

let exitCode = 0;
let exitSpy: ReturnType<typeof vi.spyOn>;
async function runCommand(args: string[]): Promise<{ stdout: string; exitCode: number }> {
  const cmd = makeRitualCommand();
  exitCode = 0;
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`exit:${code}`);
  }) as never);
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // fail() exits; the spy records the code and throws so we can inspect
  }
  exitSpy.mockRestore();
  return { stdout: stdoutBuf, exitCode };
}

const ROW = {
  id: "ritual-1",
  name: "Evening journaling",
  lensId: "lens-1",
  interval: "EVENING",
  cadence: "DAILY",
  weekday: null,
  intervalDays: null,
  guidance: "Ten minutes, three bullets",
  benefit: "Clears the noise",
  goalId: null,
  order: 0,
  paused: false,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
};

describe("ritual commands", () => {
  beforeEach(() => {
    mkdirSync(join(getConfigPath(), ".."), { recursive: true });
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:8080" });
    requestMock.mockReset();
  });
  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  describe("ritual list", () => {
    it("human output shows name, hints, interval, cadence, id", async () => {
      requestMock.mockResolvedValue({ rituals: [{ ...ROW, entryToday: null }] });
      const { stdout } = await runCommand(["list"]);
      expect(stdout).toContain("Evening journaling");
      expect(stdout).toContain("(g)");
      expect(stdout).toContain("(b)");
      expect(stdout).toContain("evening");
      expect(stdout).toContain("every day");
      expect(stdout).toContain("ritual-1");
    });

    it("--json emits the server body verbatim", async () => {
      const body = { rituals: [{ ...ROW, entryToday: { mood: "HAPPY", note: null } }] };
      requestMock.mockResolvedValue(body);
      const { stdout } = await runCommand(["list", "--json"]);
      expect(JSON.parse(stdout)).toEqual(body);
    });

    it("empty → 'No rituals.'", async () => {
      requestMock.mockResolvedValue({ rituals: [] });
      const { stdout } = await runCommand(["list"]);
      expect(stdout).toContain("No rituals.");
    });
  });

  describe("ritual today", () => {
    it("human output shows check state + mood", async () => {
      requestMock.mockResolvedValue({
        rituals: [
          { ...ROW, lensName: "Me", checked: true, mood: "HAPPY", note: "easy" },
        ],
      });
      const { stdout } = await runCommand(["today"]);
      expect(stdout).toContain("✓");
      expect(stdout).toContain("(happy)");
    });

    it("empty → 'No rituals due today.'", async () => {
      requestMock.mockResolvedValue({ rituals: [] });
      const { stdout } = await runCommand(["today"]);
      expect(stdout).toContain("No rituals due today.");
    });
  });

  describe("ritual create", () => {
    it("sends the full body with lowercase enum words", async () => {
      requestMock.mockResolvedValue({ ritual: ROW });
      await runCommand([
        "create",
        "Evening journaling",
        "--interval",
        "evening",
        "--cadence",
        "weekly",
        "--weekday",
        "sun",
        "--guidance",
        "Ten minutes",
        "--benefit",
        "Clears the noise",
      ]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/create", {
        method: "POST",
        body: {
          name: "Evening journaling",
          interval: "evening",
          cadence: "weekly",
          weekday: "sun",
          guidance: "Ten minutes",
          benefit: "Clears the noise",
        },
      });
    });

    it("sends the configured active lens when set", async () => {
      writeConfig({ token: "aa_test", apiUrl: "http://localhost:8080", lensId: "lens-9" });
      requestMock.mockResolvedValue({ ritual: ROW });
      await runCommand(["create", "Water"]);
      const init = requestMock.mock.calls[0]?.[1] as { body: Record<string, unknown> };
      expect(init.body.lensId).toBe("lens-9");
    });

    it("rejects a bad interval before any request", async () => {
      const { stdout, exitCode: code } = await runCommand([
        "create",
        "X",
        "--interval",
        "night",
        "--json",
      ]);
      expect(code).toBe(1);
      expect(JSON.parse(stdout).error).toMatch(/morning, midday, or evening/);
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe("ritual update", () => {
    it("passes '' through as null (the clear semantic)", async () => {
      requestMock.mockResolvedValue({ ritual: ROW });
      await runCommand(["update", "ritual-1", "--benefit", ""]);
      const init = requestMock.mock.calls[0]?.[1] as { body: Record<string, unknown> };
      expect(init.body).toEqual({ id: "ritual-1", benefit: null });
    });

    it("absent fields are not sent", async () => {
      requestMock.mockResolvedValue({ ritual: ROW });
      await runCommand(["update", "ritual-1", "--name", "Renamed"]);
      const init = requestMock.mock.calls[0]?.[1] as { body: Record<string, unknown> };
      expect(init.body).toEqual({ id: "ritual-1", name: "Renamed" });
    });
  });

  describe("ritual check", () => {
    it("sends mood + note and prints the local day", async () => {
      requestMock.mockResolvedValue({
        ritual: { id: "ritual-1" },
        entry: { localDate: "2026-09-19", mood: "HAPPY", note: "easy" },
      });
      const { stdout } = await runCommand(["check", "ritual-1", "--mood", "good", "--note", "easy"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/check", {
        method: "POST",
        body: { id: "ritual-1", mood: "good", note: "easy" },
      });
      expect(stdout).toContain("Checked off for 2026-09-19 (happy).");
    });

    it("rejects a bad mood locally", async () => {
      const { exitCode: code } = await runCommand(["check", "ritual-1", "--mood", "elated"]);
      expect(code).toBe(1);
      expect(requestMock).not.toHaveBeenCalled();
    });
  });

  describe("lifecycle commands", () => {
    it("uncheck / pause / resume / archive hit their routes", async () => {
      requestMock.mockResolvedValue({ ok: true });
      await runCommand(["uncheck", "ritual-1"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/uncheck", {
        method: "POST",
        body: { id: "ritual-1" },
      });

      requestMock.mockResolvedValue({ ritual: ROW, status: "paused" });
      const { stdout } = await runCommand(["pause", "ritual-1"]);
      expect(stdout).toContain("Paused 'Evening journaling'.");
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/pause", {
        method: "POST",
        body: { id: "ritual-1" },
      });

      await runCommand(["resume", "ritual-1"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/resume", {
        method: "POST",
        body: { id: "ritual-1" },
      });

      await runCommand(["archive", "ritual-1"]);
      expect(requestMock).toHaveBeenCalledWith("/api/cli/ritual/archive", {
        method: "POST",
        body: { id: "ritual-1" },
      });
    });
  });
});
