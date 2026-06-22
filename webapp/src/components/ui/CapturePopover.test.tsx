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

/** Type text into the capture input via the DOM input event (React-controlled). */
function typeIntoInput(text: string) {
  const input = screen.getByLabelText("Capture") as HTMLInputElement;
  fireEvent.change(input, { target: { value: text } });
  return input;
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
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      typeIntoInput("Email Sarah tomorrow !3 ~20m #work");

      // tomorrow → date chip, !3 → Important chip, #work → violet chip
      expect(screen.getByText(/tomorrow/i)).toBeInTheDocument();
      expect(screen.getByText(/important/i)).toBeInTheDocument();
      expect(screen.getByText("#work")).toBeInTheDocument();
    });

    it("plain text (no tokens) produces no chips", () => {
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={() => {}} />);
      typeIntoInput("just a thought");
      expect(
        screen.queryByText(/today|tomorrow|important|#/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("submit behavior", () => {
    it("Enter captures via onSubmit and closes the popover", async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      renderInContext(<CapturePopover onClose={onClose} onSubmit={onSubmit} />);

      const input = typeIntoInput("A real thought");
      fireEvent.submit(input.form!);

      expect(onSubmit).toHaveBeenCalledWith("A real thought");
      expect(onSubmit).toHaveBeenCalledTimes(1);
      // onClose runs after `await onSubmit()` — wait for the microtask.
      // Current behavior: Enter closes (rapid-fire lands in Phase 1).
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it("empty input does not submit", () => {
      const onSubmit = vi.fn();
      const onClose = vi.fn();
      renderInContext(<CapturePopover onClose={onClose} onSubmit={onSubmit} />);

      fireEvent.submit((screen.getByLabelText("Capture") as HTMLInputElement).form!);
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("whitespace-only input does not submit", () => {
      const onSubmit = vi.fn();
      renderInContext(<CapturePopover onClose={() => {}} onSubmit={onSubmit} />);

      typeIntoInput("   ");
      fireEvent.submit((screen.getByLabelText("Capture") as HTMLInputElement).form!);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("close behavior", () => {
    // NOTE: Esc handling does NOT live in CapturePopover — it's the parent's
    // job (window-level useKeyboardShortcuts handler). That path is covered
    // by useKeyboardShortcuts.test.tsx. Here we test only what this component
    // owns: backdrop click and inner-card stopPropagation.

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
});
