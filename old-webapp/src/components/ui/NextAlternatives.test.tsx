import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { NextAlternatives, type NextAlternative } from "./NextAlternatives";
import { renderInContext } from "wasp/client/test";

// NextAlternatives — the "Or choose another task" rail below the NextCard.
// Hidden entirely when there's nothing to offer; rows are single buttons that
// fire onChoose (the page navigates — nothing mutates). The "Suggested"
// kicker marks the engine's #1, which only appears while a picked task is on
// stage.

const ROWS: NextAlternative[] = [
  {
    id: "a1",
    permalink: "review-notes",
    title: "Review today's project notes",
    project: "Website",
    due: "due today",
    size: "20 min",
  },
  {
    id: "a2",
    permalink: "call-plumber",
    title: "Call the plumber",
    project: "Home",
    size: "5 min",
    suggested: true,
  },
];

describe("NextAlternatives", () => {
  it("renders nothing when there are no alternatives", () => {
    const { container } = renderInContext(
      <NextAlternatives lensName="Work" tasks={[]} onChoose={vi.fn()} />,
    );
    expect(container.querySelector(".aa-wn-alts")).toBeNull();
  });

  it("heads the section with the lens name and the stays-available hint", () => {
    renderInContext(<NextAlternatives lensName="Work" tasks={ROWS} onChoose={vi.fn()} />);
    expect(
      screen.getByText(/Or choose another task in Work/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The recommendation stays available\./),
    ).toBeInTheDocument();
  });

  it("renders each row's title and joined meta line (missing segments skipped)", () => {
    renderInContext(<NextAlternatives lensName="Work" tasks={ROWS} onChoose={vi.fn()} />);
    expect(
      screen.getByText("Review today's project notes"),
    ).toBeInTheDocument();
    expect(screen.getByText("Website · due today · 20 min")).toBeInTheDocument();
    expect(screen.getByText("Home · 5 min")).toBeInTheDocument();
  });

  it("marks only the engine's #1 row with the Suggested kicker", () => {
    renderInContext(<NextAlternatives lensName="Work" tasks={ROWS} onChoose={vi.fn()} />);
    expect(screen.getAllByText(/suggested/i)).toHaveLength(1);
    expect(
      screen.getByText("Call the plumber").closest("button"),
    ).toContainElement(screen.getByText(/suggested/i));
  });

  it("fires onChoose with the clicked row", () => {
    const onChoose = vi.fn();
    renderInContext(<NextAlternatives lensName="Work" tasks={ROWS} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole("button", { name: /Call the plumber/ }));

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ id: "a2", permalink: "call-plumber" }),
    );
  });
});
