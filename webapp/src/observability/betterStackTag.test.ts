// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tagSource = readFileSync(
  new URL("../../public/betterstack.js", import.meta.url),
  "utf8",
);

describe("Better Stack frontend tag", () => {
  it("loads the production tracker while excluding local development", () => {
    expect(tagSource).toContain("https://betterstack.net/b.js?t=");
    expect(tagSource).toContain("environment: 'production'");
    expect(tagSource).toContain("'localhost'");
    expect(tagSource).toContain("'127.0.0.1'");
    expect(tagSource).toContain("'::1'");
  });
});
