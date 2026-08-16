import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join: pathJoin } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: pathJoin(tmpdir(), `aa-resource-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));
const requestMock = vi.fn();
vi.mock("../api.js", () => ({ request: (path: string, init?: unknown) => requestMock(path, init) }));

let stdout = "";
const originalWrite = process.stdout.write.bind(process.stdout);
beforeEach(() => { stdout = ""; process.stdout.write = (chunk: string | Uint8Array) => { stdout += chunk.toString(); return true; }; });
afterEach(() => { process.stdout.write = originalWrite; rmSync(TMP_HOME, { recursive: true, force: true }); });

const { writeConfig, getConfigPath } = await import("../config.js");
const { makeResourceCommand } = await import("./resource.js");

async function run(args: string[]) {
  try { await makeResourceCommand().parseAsync(args, { from: "user" }); } catch { /* commander */ }
}

beforeEach(() => {
  mkdirSync(join(getConfigPath(), ".."), { recursive: true });
  writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
  requestMock.mockReset();
});

describe("resource commands", () => {
  it("lists resources by project", async () => {
    requestMock.mockResolvedValue({ projectId: "p1", resources: [{ id: "r1", title: "Brief", url: "https://example.com", notes: null }] });
    await run(["list", "--project", "p1"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/resource/list?projectId=p1", undefined);
    expect(stdout).toContain("Brief");
  });

  it("lists attachment ids so agents can download resource images", async () => {
    requestMock.mockResolvedValue({
      projectId: "p1",
      resources: [{
        id: "r1",
        title: "Moodboard",
        url: null,
        notes: null,
        attachments: [{ id: "att-7", filename: "moodboard.png", mimeType: "image/png" }],
      }],
    });
    await run(["list", "--project", "p1"]);
    expect(stdout).toContain("moodboard.png");
    expect(stdout).toContain("att-7");
  });

  it("adds a resource with optional fields", async () => {
    requestMock.mockResolvedValue({ resource: { id: "r1", title: "Brief", url: null, notes: "Read first" } });
    await run(["add", "Brief", "--project", "p1", "--notes", "Read first"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/resource/create", {
      method: "POST", body: { projectId: "p1", title: "Brief", notes: "Read first" },
    });
  });

  it("updates only supplied fields", async () => {
    requestMock.mockResolvedValue({ resource: { id: "r1", title: "New", url: null, notes: null } });
    await run(["update", "r1", "--title", "New"]);
    expect(requestMock).toHaveBeenCalledWith("/api/cli/resource/update", {
      method: "POST", body: { id: "r1", title: "New" },
    });
  });
});
