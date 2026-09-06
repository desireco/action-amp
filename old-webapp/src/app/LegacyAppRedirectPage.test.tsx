import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { LegacyAppRedirectPage } from "./LegacyAppRedirectPage";

function LocationProbe() {
  const { pathname, search, hash } = useLocation();
  return <div>{`at:${pathname}${search}${hash}`}</div>;
}

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app" element={<LegacyAppRedirectPage />} />
        <Route path="/app/*" element={<LegacyAppRedirectPage />} />
        <Route path="/do/*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LegacyAppRedirectPage", () => {
  it.each([
    ["/app", "at:/do"],
    ["/app/focus", "at:/do/focus"],
    ["/app?capture=1", "at:/do?capture=1"],
    ["/app/goals/some-goal?tab=notes#log", "at:/do/goals/some-goal?tab=notes#log"],
  ])("forwards %s under the new prefix", (entry, expected) => {
    renderAt(entry);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
