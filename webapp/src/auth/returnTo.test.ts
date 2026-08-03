import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTH_RETURN_TO,
  buildMagicLoginUrl,
  safeAuthReturnTo,
} from "./returnTo";

describe("safeAuthReturnTo", () => {
  it("preserves local paths, queries, and fragments", () => {
    expect(safeAuthReturnTo("/founding-100?source=home#offer"))
      .toBe("/founding-100?source=home#offer");
  });

  it.each([
    undefined,
    "",
    "founding-100",
    "https://evil.example/checkout",
    "//evil.example/checkout",
    "/\\evil.example/checkout",
  ])("falls back for unsafe destination %s", (value) => {
    expect(safeAuthReturnTo(value)).toBe(DEFAULT_AUTH_RETURN_TO);
  });
});

describe("buildMagicLoginUrl", () => {
  it("threads the safe return path into the emailed sign-in link", () => {
    expect(buildMagicLoginUrl(
      "https://app.actionamp.com",
      "secret token",
      "/founding-100",
    )).toBe(
      "https://app.actionamp.com/login?magic=secret+token&returnTo=%2Ffounding-100",
    );
  });

  it("does not put an external return URL in the emailed link", () => {
    const url = new URL(buildMagicLoginUrl(
      "https://app.actionamp.com",
      "token",
      "https://evil.example",
    ));
    expect(url.searchParams.get("returnTo")).toBe(DEFAULT_AUTH_RETURN_TO);
  });
});
