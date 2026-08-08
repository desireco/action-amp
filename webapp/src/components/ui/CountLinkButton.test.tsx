import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { CountLinkButton } from "./CountLinkButton";

describe("CountLinkButton", () => {
  it("shows a zero count instead of hiding it", () => {
    render(
      <MemoryRouter>
        <CountLinkButton label="Today" count={0} to="/app/today" />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "Open Today, 0 items" });
    expect(link).toHaveAttribute("href", "/app/today");
    expect(link).toHaveTextContent("Today0");
  });

  it("shows a stable loading placeholder until count data arrives", () => {
    render(
      <MemoryRouter>
        <CountLinkButton label="Upcoming" to="/app/upcoming" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: "Open Upcoming, loading" }),
    ).toHaveTextContent("Upcoming—");
  });
});
