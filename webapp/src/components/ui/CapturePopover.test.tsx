import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { CapturePopover } from "./CapturePopover";
import { renderInContext } from "wasp/client/test";

// CapturePopover is a pure-props component (no auth, no queries) — the ideal
// tier-B target. Renders, parses live, submits, closes. Uses renderInContext
// to prove the Wasp harness works on real components.
//
// We use fireEvent over @testing-library/user-event to avoid adding a
// dependency; the tests don't need user-event's per-keyboard realism.

/** Type text into the capture textarea via the DOM input event (React-controlled). */
function typeIntoInput(text: string) {
  const ta = screen.getByLabelText("Capture") as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value: text } });
  return ta;
}

describe("CapturePopover", () => {
  describe("rendering", () => {
    it("shows the input with the NL-parse example in the placeholder", () => {
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      const input = screen.getByLabelText("Capture");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute(
        "placeholder",
        expect.stringContaining("Email Sarah"),
      );
    });

    it("auto-focuses the input on open", () => {
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      expect(screen.getByLabelText("Capture")).toHaveFocus();
    });
  });

  describe("live NL parsing → preview chips (F2)", () => {
    it("shows no chips when the input is empty", () => {
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      typeIntoInput("");
      expect(screen.queryByText(/tomorrow/i)).not.toBeInTheDocument();
    });

    it("shows chips as tokens are typed", () => {
      const { container } = renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={() => {}} />,
      );
      typeIntoInput("Email Sarah tomorrow !3 ~20m #mvp");

      // Scope to the preview section — global getByText also matches the
      // textarea's own value in jsdom, which would throw "multiple elements".
      const preview = container.querySelector(".aa-capture__preview")!;
      // tomorrow → date chip, !3 → Important chip, #mvp → teal project chip (▣ mvp)
      expect(preview.textContent).toMatch(/tomorrow/i);
      expect(preview.textContent).toMatch(/important/i);
      expect(preview.textContent).toMatch(/▣\s*mvp/);
    });

    it("plain text (no tokens) produces no chips", () => {
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      typeIntoInput("just a thought");
      expect(
        screen.queryByText(/today|tomorrow|important|#/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("submit behavior (Phase 1: Enter to close, ⌘Enter to add another)", () => {
    it("Enter captures and closes the popover", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("A real thought");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onSubmit).toHaveBeenCalledWith("A real thought");
      expect(onSubmit).toHaveBeenCalledTimes(1);
      // Enter = capture + close (commit this one and get back to work)
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("⌘Enter captures, clears the input, and keeps the popover open (rapid-fire)", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("Another thought");
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });

      expect(onSubmit).toHaveBeenCalledWith("Another thought");
      // ⌘Enter = add to the list: popover stays open, input clears
      expect(onClose).not.toHaveBeenCalled();
      await waitFor(() => expect(input.value).toBe(""));
    });

    it("⌘Enter rapid-fire stacks captured items at the top", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("first thought");
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
      await waitFor(() => expect(input.value).toBe(""));

      typeIntoInput("second thought");
      fireEvent.keyDown(input, { key: "Enter", metaKey: true });
      await waitFor(() => expect(input.value).toBe(""));

      // both captured items appear in the stack (newest first)
      expect(screen.getByText("second thought")).toBeInTheDocument();
      expect(screen.getByText("first thought")).toBeInTheDocument();
    });

    it("empty input does not capture on Enter", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );

      fireEvent.keyDown(screen.getByLabelText("Capture"), { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("whitespace-only input does not capture", () => {
      const onSubmit = vi.fn();
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("   ");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("Shift+Enter does NOT capture (reserved for newline / Phase 3 expand)", () => {
      const onSubmit = vi.fn();
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("draft");
      fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("close behavior", () => {
    // NOTE: Esc handling does NOT live in CapturePopover — it's the parent's
    // job (window-level useKeyboardShortcuts handler). That path is covered
    // by useKeyboardShortcuts.test.tsx. Here we test only what this component
    // owns: the X button, the Save button, backdrop click, inner-card
    // stopPropagation.

    it("the X button closes without saving", () => {
      const onClose = vi.fn();
      const onSubmit = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );
      typeIntoInput("a draft I'll discard");
      fireEvent.click(screen.getByLabelText(/close without saving/i));
      expect(onClose).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("backdrop click closes without submitting", () => {
      const onClose = vi.fn();
      const onSubmit = vi.fn();
      const { container } = renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );
      fireEvent.click(container.querySelector(".aa-overlay")!);
      expect(onClose).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("clicking inside the card does NOT close", () => {
      const onClose = vi.fn();
      const { container } = renderInContext(
        <CapturePopover onClose={onClose} onSubmit={() => {}} />,
      );
      fireEvent.click(container.querySelector(".aa-overlay-card")!);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("Save button", () => {
    it("Save captures and closes (same as ⌘⏎)", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );
      typeIntoInput("final thought");
      fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
      expect(onSubmit).toHaveBeenCalledWith("final thought");
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("Save is disabled when the input is empty", () => {
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={() => {}} />,
      );
      expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });

    it("Save is disabled for whitespace-only input", () => {
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={() => {}} />,
      );
      typeIntoInput("   ");
      expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    });
  });

  describe("error handling", () => {
    // The catch block used to be empty, which turned every server failure
    // (e.g. an auth 500) into a silent no-op — "nothing happened." These
    // guard that the failure now surfaces and the input is kept for retry.

    it("surfaces an inline error and keeps the text when onSubmit rejects", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error("Not authenticated."));
      const onClose = vi.fn();
      renderInContext(
        <CapturePopover onClose={onClose} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("a thought that won't save");
      fireEvent.keyDown(input, { key: "Enter" });

      // The popover stays open, the text is preserved for a retry…
      await waitFor(() =>
        expect(screen.getByText(/not authenticated/i)).toBeInTheDocument(),
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(input.value).toBe("a thought that won't save");
    });

    it("falls back to a calm default when the error carries no message", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error(""));
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={onSubmit} />,
      );

      fireEvent.keyDown(typeIntoInput("x"), { key: "Enter" });

      await waitFor(() =>
        expect(screen.getByText(/could not save/i)).toBeInTheDocument(),
      );
    });

    it("clears the error once the user edits the text", async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error("Not authenticated."));
      renderInContext(
        <CapturePopover onClose={() => {}} onSubmit={onSubmit} />,
      );

      const input = typeIntoInput("a thought");
      fireEvent.keyDown(input, { key: "Enter" });
      await waitFor(() =>
        expect(screen.getByText(/not authenticated/i)).toBeInTheDocument(),
      );

      // Typing again dismisses the error and restores the shortcut hint.
      fireEvent.change(input, { target: { value: "a thought edited" } });
      expect(screen.queryByText(/not authenticated/i)).not.toBeInTheDocument();
    });
  });
});
