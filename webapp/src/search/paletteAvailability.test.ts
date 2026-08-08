import { describe, expect, it } from "vitest";
import { isPaletteBlocked, type PaletteBlockers } from "./paletteAvailability";

const clear: PaletteBlockers = {
  working: false,
  triage: false,
  capture: false,
  shortcuts: false,
  confirmation: false,
  feedback: false,
  mobileLens: false,
  palette: false,
};

describe("palette overlay precedence", () => {
  it("opens only when no blocking mode or overlay is active", () => {
    expect(isPaletteBlocked(clear)).toBe(false);
    for (const key of Object.keys(clear) as Array<keyof PaletteBlockers>) {
      expect(isPaletteBlocked({ ...clear, [key]: true }), key).toBe(true);
    }
  });
});
