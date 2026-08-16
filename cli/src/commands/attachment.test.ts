/**
 * Tests for the top-level `attachment download` command — the generic
 * image pull for agents (works for every attachment table). Mirrors the
 * inbox.download.test.ts harness: mocked api layer, real file writes in a
 * temp cwd. `inbox download` now delegates here, so these also cover it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir: td } = require("node:os") as typeof import("node:os");
  const { join: j } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: j(td(), `aa-att-home-${process.pid}-${Date.now()}`) };
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
    // SAFETY: mock body mirrors the ApiError shape the api module exports.
    constructor(public status: number, public body: { error?: string } & Record<string, unknown>) {
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
  TMP_CWD = mkdtempSync(join(tmpdir(), "aa-att-cwd-"));
  process.chdir(TMP_CWD);
});
afterEach(() => {
  process.stdout.write = origWrite;
  process.chdir(origCwd);
  rmSync(TMP_CWD, { recursive: true, force: true });
  rmSync(TMP_HOME, { recursive: true, force: true });
});

const { makeAttachmentCommand } = await import("./attachment.js");
const { makeInboxCommand } = await import("./inbox.js");

const PNG = Buffer.from("fake-png-bytes");
function okResult(overrides: Record<string, unknown> = {}) {
  return {
    buffer: PNG,
    mimeType: "image/png",
    filename: "error-shot.png",
    size: PNG.length,
    ...overrides,
  };
}

async function run(cmd: Command, args: string[]) {
  try {
    await cmd.parseAsync(args, { from: "user" });
  } catch {
    // commander errors (e.g. process.exit from fail())
  }
  return { stdout: stdoutBuf };
}

describe("attachment download", () => {
  beforeEach(() => {
    downloadMock.mockReset();
  });

  it("downloads by id, writes the file, reports the path", async () => {
    downloadMock.mockResolvedValue(okResult());
    const { stdout } = await run(makeAttachmentCommand(), ["download", "att-1"]);
    expect(downloadMock).toHaveBeenCalledWith("/api/cli/attachment/att-1");
    expect(readFileSync(join(TMP_CWD, "error-shot.png"))).toEqual(PNG);
    expect(stdout).toContain("error-shot.png");
  });

  it("URL-encodes the attachment id", async () => {
    downloadMock.mockResolvedValue(okResult());
    await run(makeAttachmentCommand(), ["download", "a b/c"]);
    expect(downloadMock).toHaveBeenCalledWith("/api/cli/attachment/a%20b%2Fc");
  });

  it("explicit out path wins over the server filename", async () => {
    downloadMock.mockResolvedValue(okResult());
    await run(makeAttachmentCommand(), ["download", "att-1", "custom.png"]);
    expect(readFileSync(join(TMP_CWD, "custom.png"))).toEqual(PNG);
  });

  it("falls back to <id>.<ext-from-mime> when the server sends no filename", async () => {
    downloadMock.mockResolvedValue(okResult({ filename: null }));
    await run(makeAttachmentCommand(), ["download", "att-9"]);
    expect(readFileSync(join(TMP_CWD, "att-9.png"))).toEqual(PNG);
  });

  it("--json emits the machine shape", async () => {
    downloadMock.mockResolvedValue(okResult());
    const { stdout } = await run(makeAttachmentCommand(), ["download", "att-1", "--json"]);
    const parsed = JSON.parse(stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.bytes).toBe(PNG.length);
    expect(parsed.mimeType).toBe("image/png");
  });

  it("inbox download delegates to the same shared action", async () => {
    downloadMock.mockResolvedValue(okResult());
    await run(makeInboxCommand(), ["download", "att-1"]);
    expect(downloadMock).toHaveBeenCalledWith("/api/cli/attachment/att-1");
    expect(readFileSync(join(TMP_CWD, "error-shot.png"))).toEqual(PNG);
  });
});
