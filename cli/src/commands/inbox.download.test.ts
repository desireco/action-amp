/**
 * Tests for `inbox download` (attachment pull for app/mobile test loops).
 *
 * Unit-level: mocks the api layer (no real HTTP) but exercises the real
 * file-write path in a temp dir. Asserts: explicit --out path, server
 * filename fallback, id+mime fallback, --json shape, and error surfacing.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir: td } = require("node:os") as typeof import("node:os");
  const { join: j } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: j(td(), `aa-dl-home-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => TMP_HOME };
});

const downloadMock = vi.fn();
vi.mock("../api.js", () => ({
  request: vi.fn(),
  download: (path: string) => downloadMock(path),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public body: Record<string, unknown>) {
      super(body.error ?? "error");
    }
  },
}));

let stdoutBuf = "";
let TMP_CWD = "";
const origWrite = process.stdout.write.bind(process.stdout);
const origCwd = process.cwd();
beforeEach(() => {
  stdoutBuf = "";
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdoutBuf += chunk.toString();
    return true;
  };
  TMP_CWD = mkdtempSync(join(tmpdir(), "aa-dl-cwd-"));
  process.chdir(TMP_CWD);
});
afterEach(() => {
  process.stdout.write = origWrite;
  process.chdir(origCwd);
  rmSync(TMP_CWD, { recursive: true, force: true });
});

const { makeInboxCommand } = await import("./inbox.js");

const PNG = Buffer.from("fake-png-bytes");
function okResult(overrides: Record<string, unknown> = {}) {
  return {
    buffer: PNG,
    mimeType: "image/png",
    filename: "Screenshot_20260816.png",
    size: PNG.length,
    ...overrides,
  };
}

async function runCommand(args: string[]): Promise<{ stdout: string }> {
  const cmd = makeInboxCommand();
  try {
    await cmd.parseAsync(["download", ...args], { from: "user" });
  } catch {
    // commander exits on error; catch so the test can inspect state.
  }
  return { stdout: stdoutBuf };
}

describe("inbox download", () => {
  const ID = "3c508548-af3b-4cf7-a220-872c2573d114";

  it("downloads to the server-provided filename in cwd", async () => {
    downloadMock.mockResolvedValue(okResult());
    const { stdout } = await runCommand([ID]);
    expect(downloadMock).toHaveBeenCalledWith(`/api/cli/attachment/${ID}`);
    expect(stdout).toContain("Saved");
    const written = readFileSync(join(TMP_CWD, "Screenshot_20260816.png"));
    expect(written.equals(PNG)).toBe(true);
  });

  it("writes to an explicit out path when given", async () => {
    downloadMock.mockResolvedValue(okResult());
    const { stdout } = await runCommand([ID, "out.png"]);
    expect(stdout).toContain(join(TMP_CWD, "out.png"));
    expect(readFileSync(join(TMP_CWD, "out.png")).equals(PNG)).toBe(true);
  });

  it("falls back to <id>.<ext> without a server filename", async () => {
    downloadMock.mockResolvedValue(okResult({ filename: null }));
    await runCommand([ID]);
    expect(readFileSync(join(TMP_CWD, `${ID}.png`)).equals(PNG)).toBe(true);
  });

  it("emits a JSON result with --json", async () => {
    downloadMock.mockResolvedValue(okResult());
    const { stdout } = await runCommand([ID, "out.png", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.bytes).toBe(PNG.length);
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.path).toContain("out.png");
  });

  it("surfaces ApiError messages", async () => {
    const { ApiError } = await import("../api.js");
    downloadMock.mockRejectedValue(new ApiError(404, { error: "Not found." }));
    await runCommand([ID]);
    // The command rethrows (index.ts's global handler formats it); the
    // observable contract here is that nothing was written.
    expect(() => readFileSync(join(TMP_CWD, "Screenshot_20260816.png"))).toThrow();
  });
});
