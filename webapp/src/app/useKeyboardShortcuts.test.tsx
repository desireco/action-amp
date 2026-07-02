import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { useKeyboardShortcuts, type ShortcutHandlers } from "./useKeyboardShortcuts";

// Harness: a tiny component that invokes the hook. The hook attaches a
// window keydown listener; we dispatch synthetic KeyboardEvents and assert
// the right handler fired (or didn't). Validates the locked keyset (TRIAGE.md §7).

function Harness(props: ShortcutHandlers) {
  useKeyboardShortcuts(props);
  return null;
}

/** Dispatch a keydown on window with the given key + modifier state. */
function press(key: string, opts: { meta?: boolean; shift?: boolean; target?: Element } = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      metaKey: opts.meta ?? false,
      shiftKey: opts.shift ?? false,
      ctrlKey: opts.meta ?? false, // treat ctrl like meta (cross-platform)
    }),
  );
}

// The hook ignores keystrokes when the focus is in an input/textarea. We fake
// that by setting document.activeElement to a mock element with a tagName.
function setTypingTarget(tagName: string) {
  const el = document.createElement(tagName);
  document.body.appendChild(el);
  el.focus();
  vi.spyOn(document, "activeElement", "get").mockReturnValue(el);
  // dispatchEvent targets whatever element was passed; the hook reads e.target
  return el;
}

let handlers: Required<ShortcutHandlers>;

beforeEach(() => {
  // vi.fn()'s Mock type isn't directly assignable to () => void (Vitest
  // typing quirk), so one localized cast here keeps the rest of the file clean.
  handlers = {
    onCapture: vi.fn(),
    onGoHome: vi.fn(),
    onToggleCheatsheet: vi.fn(),
    onCloseOverlay: vi.fn(),
  } as unknown as Required<ShortcutHandlers>;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren(); // clears manually-created els (RTL cleanup handles React trees)
});

describe("useKeyboardShortcuts — capture", () => {
  it("⌘K opens capture", () => {
    render(<Harness {...handlers} />);
    press("k", { meta: true });
    expect(handlers.onCapture).toHaveBeenCalledTimes(1);
  });

  it("⌘K fires even inside a text field (focus-protector)", () => {
    const input = setTypingTarget("INPUT");
    render(<Harness {...handlers} />);
    // Dispatch from the input so e.target is the input element
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
    );
    expect(handlers.onCapture).toHaveBeenCalledTimes(1);
  });

  it("⌘/ opens capture (alternate chord, same as ⌘K)", () => {
    render(<Harness {...handlers} />);
    press("/", { meta: true });
    expect(handlers.onCapture).toHaveBeenCalledTimes(1);
  });

  it("bare / does NOT open capture (retired — Firefox quick-find conflict)", () => {
    render(<Harness {...handlers} />);
    press("/");
    expect(handlers.onCapture).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts — cheatsheet", () => {
  it("⌘? toggles cheatsheet (works in fields — Cmd chord doesn't type text)", () => {
    const input = setTypingTarget("INPUT");
    render(<Harness {...handlers} />);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", metaKey: true, shiftKey: true, bubbles: true }),
    );
    expect(handlers.onToggleCheatsheet).toHaveBeenCalledTimes(1);
  });

  it("bare ? toggles cheatsheet when NOT typing", () => {
    render(<Harness {...handlers} />);
    press("?", { shift: true });
    expect(handlers.onToggleCheatsheet).toHaveBeenCalledTimes(1);
  });

  it("bare ? does NOT fire inside a text field (Shift+/ types ?)", () => {
    const input = setTypingTarget("INPUT");
    render(<Harness {...handlers} />);
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }),
    );
    expect(handlers.onToggleCheatsheet).not.toHaveBeenCalled();
  });
});

describe("useKeyboardShortcuts — navigation", () => {
  it("Space goes to Next", () => {
    render(<Harness {...handlers} />);
    press(" ");
    expect(handlers.onGoHome).toHaveBeenCalledTimes(1);
  });

  it("Space does NOT fire on a button (preserves button activation)", () => {
    render(<Harness {...handlers} />);
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(handlers.onGoHome).not.toHaveBeenCalled();
  });

  it("Esc closes the topmost overlay", () => {
    render(<Harness {...handlers} />);
    press("Escape");
    expect(handlers.onCloseOverlay).toHaveBeenCalledTimes(1);
  });

  it("Esc fires even inside a text field", () => {
    const input = setTypingTarget("INPUT");
    render(<Harness {...handlers} />);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(handlers.onCloseOverlay).toHaveBeenCalledTimes(1);
  });
});

describe("useKeyboardShortcuts — typing guard", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])(
    "Space is suppressed inside a %s",
    (tagName) => {
      const el = setTypingTarget(tagName);
      render(<Harness {...handlers} />);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
      expect(handlers.onGoHome).not.toHaveBeenCalled();
    },
  );

  it("bare ? is suppressed inside a contenteditable element", () => {
    const div = document.createElement("div");
    div.contentEditable = "true";
    // jsdom doesn't populate isContentEditable — mock it to test the hook's
    // actual check (el.isContentEditable), which is correct in real browsers.
    Object.defineProperty(div, "isContentEditable", { value: true });
    document.body.appendChild(div);
    div.focus();
    vi.spyOn(document, "activeElement", "get").mockReturnValue(div);
    render(<Harness {...handlers} />);
    div.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }));
    expect(handlers.onToggleCheatsheet).not.toHaveBeenCalled();
  });
});
