import { describe, expect, it } from "vitest";
import { cookieDomainAttribute } from "./sessionCookieMirror";

// The production bug this pins: app.actionamp.com and api.actionamp.com are
// different hosts. A host-only document.cookie write (no Domain) stays on the
// client host, so <img> requests to the API origin arrive cookie-less and
// 401. The attribute must widen the cookie to the shared suffix in prod and
// stay host-only wherever one host serves both roles (dev).
describe("cookieDomainAttribute", () => {
  it("widens to the shared suffix in production", () => {
    expect(
      cookieDomainAttribute("app.actionamp.com", "https://api.actionamp.com"),
    ).toBe("; Domain=actionamp.com");
  });

  it("stays host-only on localhost (dev shares one host)", () => {
    expect(cookieDomainAttribute("localhost", "http://localhost:3001")).toBe("");
  });

  it("stays host-only when client and API hosts are unrelated", () => {
    expect(cookieDomainAttribute("app.actionamp.com", "https://api.example.com")).toBe("");
  });

  it("stays host-only when client and API are the same host", () => {
    expect(
      cookieDomainAttribute("app.actionamp.com", "https://app.actionamp.com"),
    ).toBe("");
  });

  it("tolerates an empty or malformed API origin", () => {
    expect(cookieDomainAttribute("app.actionamp.com", "")).toBe("");
    expect(cookieDomainAttribute("app.actionamp.com", "not a url")).toBe("");
  });
});
