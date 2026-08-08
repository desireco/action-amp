import { describe, expect, it } from "vitest";
import { isLocalStatCounterHost } from "./StatCounter";

describe("isLocalStatCounterHost", () => {
  it.each([
    "localhost",
    "app.localhost",
    "127.0.0.1",
    "::1",
    "LOCALHOST",
  ])("disables StatCounter on %s", (hostname) => {
    expect(isLocalStatCounterHost(hostname)).toBe(true);
  });

  it.each([
    "actionamp.com",
    "app.actionamp.com",
    "localhost.example.com",
  ])("allows StatCounter on %s", (hostname) => {
    expect(isLocalStatCounterHost(hostname)).toBe(false);
  });
});
