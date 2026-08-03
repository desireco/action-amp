// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getFunnelStatsCore, recordAnalyticsEventCore } from "./operationsCore";
import { mockContext } from "../test/mockContext";

describe("recordAnalyticsEventCore", () => {
  it("validates metadata and records a typed event in the visitor session", async () => {
    const { entities } = mockContext();
    entities.AnalyticsSession.upsert.mockResolvedValue({ id: "session-1", userId: null });
    entities.AnalyticsEvent.create.mockResolvedValue({ id: "event-1" });

    const result = await recordAnalyticsEventCore(entities, {
      name: "LANDING_VIEW",
      visitorId: "visitor_123",
      metadata: { surface: "landing", email: "must-not-be-stored" },
    });

    expect(result).toEqual({ recorded: true, id: "event-1" });
    expect(entities.AnalyticsEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: "LANDING_VIEW",
        sessionId: "session-1",
        metadata: { surface: "landing" },
      }),
    }));
  });

  it("deduplicates one-time events for a known user", async () => {
    const { entities } = mockContext();
    entities.AnalyticsSession.findFirst.mockResolvedValue({ id: "session-1", userId: "user-1" });
    entities.AnalyticsEvent.findFirst.mockResolvedValue({ id: "existing" });

    const result = await recordAnalyticsEventCore(entities, {
      name: "APP_OPENED",
      visitorId: "user_user-1",
    }, "user-1");

    expect(result).toEqual({ recorded: false, id: "existing" });
    expect(entities.AnalyticsEvent.create).not.toHaveBeenCalled();
  });
});

describe("getFunnelStatsCore", () => {
  it("groups funnel steps and unknown acquisition sources without PII", async () => {
    const { entities } = mockContext();
    const day = new Date("2026-08-01T12:00:00Z");
    entities.AnalyticsSession.findMany.mockResolvedValue([
      { id: "s1", referrerHost: null, utmSource: "launch", utmMedium: null, utmCampaign: "aug", events: [
        { name: "LANDING_VIEW", userId: null, occurredAt: day },
        { name: "SIGNUP_COMPLETED", userId: "u1", occurredAt: day },
        { name: "PAYMENT_CONFIRMED", userId: "u1", occurredAt: day },
      ] },
      { id: "s2", referrerHost: null, utmSource: null, utmMedium: null, utmCampaign: null, events: [
        { name: "LANDING_VIEW", userId: null, occurredAt: day },
      ] },
    ]);

    const result = await getFunnelStatsCore(entities, "all");

    expect(result.funnel[0]).toMatchObject({ name: "LANDING_VIEW", count: 2, fromLandingPct: 100 });
    expect(result.funnel[1]).toMatchObject({ name: "SIGNUP_COMPLETED", count: 1, fromPreviousPct: 50 });
    expect(result.sources.map((row) => row.source)).toEqual(["launch / aug", "Unknown source"]);
    expect(result.sources[0].conversionPct).toBe(100);
  });
});
