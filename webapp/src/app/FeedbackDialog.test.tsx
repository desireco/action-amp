import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderInContext } from "wasp/client/test";
import { FeedbackDialog } from "./FeedbackDialog";

describe("FeedbackDialog", () => {
  it("⌘↵ submits the trimmed message, then closes", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderInContext(<FeedbackDialog onSubmit={onSubmit} onClose={onClose} />);

    const textarea = screen.getByPlaceholderText(/what should we know/i);
    fireEvent.change(textarea, { target: { value: "  felt slow  " } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("felt slow"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("Ctrl+↵ also submits (cross-platform)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInContext(<FeedbackDialog onSubmit={onSubmit} onClose={() => {}} />);

    const textarea = screen.getByPlaceholderText(/what should we know/i);
    fireEvent.change(textarea, { target: { value: "hi" } });
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("hi"));
  });

  it("plain Enter does not submit (multi-line textarea)", () => {
    const onSubmit = vi.fn();
    renderInContext(<FeedbackDialog onSubmit={onSubmit} onClose={() => {}} />);

    const textarea = screen.getByPlaceholderText(/what should we know/i);
    fireEvent.change(textarea, { target: { value: "line one" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("⌘↵ on an empty/whitespace draft is a no-op (Send stays disabled)", () => {
    const onSubmit = vi.fn();
    renderInContext(<FeedbackDialog onSubmit={onSubmit} onClose={() => {}} />);

    const textarea = screen.getByPlaceholderText(/what should we know/i);
    fireEvent.change(textarea, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a ⌘↵ hint so the shortcut is discoverable", () => {
    renderInContext(<FeedbackDialog onSubmit={vi.fn().mockResolvedValue(undefined)} onClose={() => {}} />);
    expect(screen.getByText("⌘↵")).toBeInTheDocument();
  });
});
