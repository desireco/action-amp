// @vitest-environment node
// Pure helper (no React, no wasp import) — node env. The helper guards all
// browser-API access so these tests cover the SSR-safe path directly; the
// happy path with a real window is exercised by the e2e/dev flow.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { captureFeedbackContext, sectionForPath } from "./captureContext";

describe("sectionForPath", () => {
  it("maps plan routes", () => {
    expect(sectionForPath("/app/upcoming")).toBe("plan");
    expect(sectionForPath("/app/projects")).toBe("plan");
    expect(sectionForPath("/app/goals")).toBe("plan");
    expect(sectionForPath("/app/someday")).toBe("plan");
  });

  it("maps review routes", () => {
    expect(sectionForPath("/app/logbook")).toBe("review");
    expect(sectionForPath("/app/review/today")).toBe("review");
    expect(sectionForPath("/app/review/week")).toBe("review");
    expect(sectionForPath("/app/review/month")).toBe("review");
  });

  it("defaults Do/Next/Today/Inbox + unknown to work", () => {
    expect(sectionForPath("/app")).toBe("work");
    expect(sectionForPath("/app/today")).toBe("work");
    expect(sectionForPath("/app/inbox")).toBe("work");
    expect(sectionForPath("/app/next")).toBe("work");
    expect(sectionForPath("/app/tasks/abc")).toBe("work");
    expect(sectionForPath("/unknown")).toBe("work");
  });
});

describe("captureFeedbackContext", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null userAgent/viewport/timezone when window is undefined (SSR)", () => {
    const ctx = captureFeedbackContext({ pathname: "/app", search: "" });
    expect(ctx.userAgent).toBeNull();
    expect(ctx.viewport).toBeNull();
    expect(ctx.timezone).toBeNull();
  });

  it("still builds route + section without a window", () => {
    const ctx = captureFeedbackContext({ pathname: "/app/logbook", search: "?x=1" });
    expect(ctx.route).toBe("/app/logbook?x=1");
    expect(ctx.section).toBe("review");
  });

  it("concatenates pathname + search into route", () => {
    vi.stubGlobal("window", { innerWidth: 1440, innerHeight: 900, navigator: { userAgent: "Mozilla/5.0" } });
    const ctx = captureFeedbackContext({ pathname: "/app/today", search: "?filter=now" });
    expect(ctx.route).toBe("/app/today?filter=now");
  });

  it("captures viewport as WxH when innerWidth/innerHeight are numbers", () => {
    vi.stubGlobal("window", { innerWidth: 375, innerHeight: 812, navigator: { userAgent: "Mozilla/5.0" } });
    const ctx = captureFeedbackContext({ pathname: "/app", search: "" });
    expect(ctx.viewport).toBe("375x812");
  });

  it("captures userAgent from navigator", () => {
    vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768, navigator: { userAgent: "Mozilla/5.0 test" } });
    const ctx = captureFeedbackContext({ pathname: "/app", search: "" });
    expect(ctx.userAgent).toBe("Mozilla/5.0 test");
  });

  it("captures timezone from Intl when available", () => {
    vi.stubGlobal("window", { innerWidth: 1024, innerHeight: 768, navigator: { userAgent: "x" } });
    const ctx = captureFeedbackContext({ pathname: "/app", search: "" });
    // The exact tz depends on the host, but it must be a non-empty string here.
    expect(typeof ctx.timezone).toBe("string");
    expect(ctx.timezone!.length).toBeGreaterThan(0);
  });

  it("returns null viewport when innerWidth/innerHeight are missing", () => {
    vi.stubGlobal("window", { navigator: { userAgent: "x" } });
    const ctx = captureFeedbackContext({ pathname: "/app", search: "" });
    expect(ctx.viewport).toBeNull();
  });
});
