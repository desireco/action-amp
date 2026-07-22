/**
 * Tests for config read/write — the edge cases that cause "login crashed":
 * corrupt config, missing config, write permissions, env overrides.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock os.homedir so config lives in a temp dir per test, not the real ~/.config
// vi.hoisted runs before the vi.mock factory, so TMP_HOME is defined when the factory runs.
const { TMP_HOME } = vi.hoisted(() => {
  const { tmpdir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  return { TMP_HOME: join(tmpdir(), `actionamp-test-${process.pid}-${Date.now()}`) };
});
vi.mock("node:os", () => ({ homedir: () => TMP_HOME }));

// Import AFTER the mock so the module picks up the temp homedir
const { readConfig, writeConfig, deleteConfig, getConfigPath, resolveUrls } = await import("./config.js");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TMP_HOME, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it("readConfig returns null when no config file exists", () => {
    expect(readConfig()).toBeNull();
  });

  it("writeConfig + readConfig round-trips", () => {
    writeConfig({ token: "aa_test123", apiUrl: "http://localhost:3001" });
    const cfg = readConfig();
    expect(cfg).toEqual({ token: "aa_test123", apiUrl: "http://localhost:3001" });
  });

  it("readConfig returns null on corrupt JSON (not a crash)", () => {
    const path = getConfigPath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "{ this is not valid json", { mode: 0o600 });
    expect(readConfig()).toBeNull();
  });

  it("readConfig returns null when token field is missing", () => {
    const path = getConfigPath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ apiUrl: "http://localhost:3001" }), {
      mode: 0o600,
    });
    expect(readConfig()).toBeNull();
  });

  it("readConfig returns null when apiUrl field is missing", () => {
    const path = getConfigPath();
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify({ token: "aa_test" }), { mode: 0o600 });
    expect(readConfig()).toBeNull();
  });

  it("deleteConfig removes the file", () => {
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    expect(existsSync(getConfigPath())).toBe(true);
    deleteConfig();
    expect(existsSync(getConfigPath())).toBe(false);
  });

  it("deleteConfig is a no-op when no file exists", () => {
    expect(() => deleteConfig()).not.toThrow();
  });

  it("writeConfig creates the directory if it doesn't exist", () => {
    expect(existsSync(join(getConfigPath(), ".."))).toBe(false);
    writeConfig({ token: "aa_test", apiUrl: "http://localhost:3001" });
    expect(existsSync(getConfigPath())).toBe(true);
  });
});

describe("resolveUrls", () => {
  it("dev=true → localhost URLs", () => {
    const { apiUrl, webUrl } = resolveUrls(true);
    expect(apiUrl).toBe("http://localhost:3001");
    expect(webUrl).toBe("http://localhost:4000");
  });

  it("dev=false → prod URLs", () => {
    const { apiUrl, webUrl } = resolveUrls(false);
    expect(apiUrl).toBe("https://api.actionamp.com");
    expect(webUrl).toBe("https://app.actionamp.com");
  });

  it("env override beats the flag", () => {
    const oldApi = process.env.ACTIONAMP_API_URL;
    const oldWeb = process.env.ACTIONAMP_WEB_URL;
    process.env.ACTIONAMP_API_URL = "https://custom.api.com";
    process.env.ACTIONAMP_WEB_URL = "https://custom.web.com";
    const { apiUrl, webUrl } = resolveUrls(true);
    expect(apiUrl).toBe("https://custom.api.com");
    expect(webUrl).toBe("https://custom.web.com");
    if (oldApi === undefined) delete process.env.ACTIONAMP_API_URL;
    else process.env.ACTIONAMP_API_URL = oldApi;
    if (oldWeb === undefined) delete process.env.ACTIONAMP_WEB_URL;
    else process.env.ACTIONAMP_WEB_URL = oldWeb;
  });

  it("trailing slash stripped", () => {
    process.env.ACTIONAMP_API_URL = "http://localhost:3001/";
    const { apiUrl } = resolveUrls(false);
    expect(apiUrl).toBe("http://localhost:3001");
    delete process.env.ACTIONAMP_API_URL;
  });
});
