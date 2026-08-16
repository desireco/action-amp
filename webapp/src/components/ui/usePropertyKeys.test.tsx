// Test for usePropertyKeys — the property-key shortcuts ([ ] - = H).
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePropertyKeys } from "./usePropertyKeys";
import type { PropertyKeyValues } from "./usePropertyKeys";

function fireKey(key: string, opts: { target?: Element } = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "target", {
    value: opts.target ?? document.body,
  });
  window.dispatchEvent(event);
}

/** A fake input element, so isTypingTarget returns true. */
function fakeInput(): HTMLElement {
  const el = document.createElement("input");
  return el;
}

function setup(initial: PropertyKeyValues) {
  const values = { ...initial };
  const set = vi.fn((patch: Partial<PropertyKeyValues>) =>
    Object.assign(values, patch),
  );
  const get = () => ({ ...values });
  return { values, set, get };
}

describe("usePropertyKeys — size ([ / ])", () => {
  it("] cycles size up (S → M → L → XL → S)", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("]");
    expect(set).toHaveBeenCalledWith({ size: "L" });
  });

  it("[ cycles size down (M → S)", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("[");
    expect(set).toHaveBeenCalledWith({ size: "S" });
  });

  it("wraps at the ends (XL → S on ], S → XL on [)", () => {
    const up = setup({ status: "TODAY", priority: "NORMAL", size: "XL" });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get: up.get, set: up.set as never }),
    );
    fireKey("]");
    expect(up.set).toHaveBeenCalledWith({ size: "S" });

    const down = setup({ status: "TODAY", priority: "NORMAL", size: "S" });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get: down.get, set: down.set as never }),
    );
    fireKey("[");
    expect(down.set).toHaveBeenCalledWith({ size: "XL" });
  });
});

describe("usePropertyKeys — priority (- / =)", () => {
  it("= cycles priority up (Normal → Important)", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("=");
    expect(set).toHaveBeenCalledWith({ priority: "IMPORTANT" });
  });

  it("- cycles priority down (Normal → Low)", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("-");
    expect(set).toHaveBeenCalledWith({ priority: "LOW" });
  });
});

describe("usePropertyKeys — when (H)", () => {
  it("h cycles When (Today → Upcoming → Someday → Today)", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("h");
    expect(set).toHaveBeenCalledWith({ status: "UPCOMING" });
  });

  it("H (uppercase) also cycles When", () => {
    const { set, get } = setup({
      status: "UPCOMING",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("H");
    expect(set).toHaveBeenCalledWith({ status: "SOMEDAY" });
  });
});

describe("usePropertyKeys — guards", () => {
  it("does nothing when disabled", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: false, get, set: set as never }),
    );
    fireKey("]");
    expect(set).not.toHaveBeenCalled();
  });

  it("does nothing when typing in an input", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("]", { target: fakeInput() });
    expect(set).not.toHaveBeenCalled();
  });

  it("does nothing on meta chords", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    const event = new KeyboardEvent("keydown", {
      key: "]",
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
    expect(set).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys", () => {
    const { set, get } = setup({
      status: "TODAY",
      priority: "NORMAL",
      size: "M",
    });
    renderHook(() =>
    // SAFETY: set param unused in this test case; never bypasses type check.
      usePropertyKeys({ enabled: true, get, set: set as never }),
    );
    fireKey("x");
    fireKey("Enter");
    fireKey("1");
    expect(set).not.toHaveBeenCalled();
  });
});
