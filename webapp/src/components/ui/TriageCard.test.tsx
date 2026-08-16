import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { TriageCard, type TriageChip } from "./TriageCard";
import { renderInContext } from "wasp/client/test";

// TriageCard is a pure display component — no callbacks, no auth, no queries.
// Renders the captured item body, optional meta, and parsed-token chips.

describe("TriageCard", () => {
  describe("rendering", () => {
    it("shows the body text", () => {
      renderInContext(<TriageCard body="Email Sarah" />);
      expect(screen.getByText("Email Sarah")).toBeInTheDocument();
    });

    it("makes the title directly editable when given a change handler", () => {
      let title = "Email Sarah";
      const onBodyChange = (next: string) => {
        title = next;
      };
      renderInContext(
        <TriageCard body={title} onBodyChange={onBodyChange} />,
      );

      fireEvent.change(screen.getByRole("textbox", { name: "Title" }), {
        target: { value: "Email Sarah about Q3" },
      });

      expect(title).toBe("Email Sarah about Q3");
    });

    it("shows the meta line when provided", () => {
      renderInContext(<TriageCard body="X" meta="captured 14 min ago" />);
      expect(screen.getByText("captured 14 min ago")).toBeInTheDocument();
    });

    it("omits the meta line when not provided", () => {
      renderInContext(<TriageCard body="X" />);
      expect(screen.queryByText(/captured/i)).not.toBeInTheDocument();
    });
  });

  describe("chips", () => {
    const chips: TriageChip[] = [
      { tone: "date", label: "tomorrow" },
      { tone: "priority", label: "Important" },
      { tone: "tag", label: "#work" },
    ];

    it("renders chips when provided", () => {
      renderInContext(<TriageCard body="X" chips={chips} />);
      expect(screen.getByText("tomorrow")).toBeInTheDocument();
      expect(screen.getByText("Important")).toBeInTheDocument();
      expect(screen.getByText("#work")).toBeInTheDocument();
    });

    it("renders no chip section when chips array is empty", () => {
      const { container } = renderInContext(<TriageCard body="X" chips={[]} />);
      expect(container.querySelector(".aa-triage-card__chips")).toBeNull();
    });

    it("renders no chip section when chips is undefined", () => {
      const { container } = renderInContext(<TriageCard body="X" />);
      expect(container.querySelector(".aa-triage-card__chips")).toBeNull();
    });
  });

  describe("media", () => {
    const media = [{ id: "att-1", filename: "Screenshot.png" }];

    it("renders thumbnails linking to the serve route when provided", () => {
      renderInContext(<TriageCard body="X" media={media} />);
      const link = screen.getByRole("link", { name: /Screenshot\.png/i });
      expect(link).toHaveAttribute("href", expect.stringContaining("/api/attachments/att-1"));
      expect(screen.getByAltText("Screenshot.png")).toBeInTheDocument();
    });

    it("renders no media section when media is empty or undefined", () => {
      const { container, rerender } = renderInContext(<TriageCard body="X" media={[]} />);
      expect(container.querySelector(".aa-triage-card__media")).toBeNull();
      rerender(<TriageCard body="X" />);
      expect(container.querySelector(".aa-triage-card__media")).toBeNull();
    });
  });
});
