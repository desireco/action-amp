import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { OverflowMenu } from "./OverflowMenu";
import { renderInContext } from "wasp/client/test";

// OverflowMenu — the ⋯ tray for detail-page lifecycle actions. jsdom has no
// matchMedia, so useMediaQuery defaults to the desktop popover; the mobile
// bottom-sheet branch is covered by mocking matchMedia below.

const ITEMS = [
  { label: "Move", onPick: vi.fn() },
  { label: "Delete", onPick: vi.fn(), danger: true },
];

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

afterEach(() => {
  // @ts-expect-error restore jsdom's absent matchMedia between tests
  delete window.matchMedia;
});

describe("OverflowMenu", () => {
  it("opens a menu popover on trigger click and fires the picked action", () => {
    mockMatchMedia(false);
    const onPick = vi.fn();
    renderInContext(
      <OverflowMenu items={[{ label: "Archive", onPick }, ...ITEMS]} />,
    );

    const trigger = screen.getByRole("button", { name: "More actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    // Picking closes the menu again.
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape and refocuses the trigger", () => {
    mockMatchMedia(false);
    renderInContext(<OverflowMenu items={ITEMS} />);

    const trigger = screen.getByRole("button", { name: "More actions" });
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("cycles items with arrow keys", () => {
    mockMatchMedia(false);
    renderInContext(<OverflowMenu items={ITEMS} />);

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(items[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);
  });

  it("renders the mobile bottom sheet instead of a popover", () => {
    mockMatchMedia(true);
    renderInContext(<OverflowMenu label="Project actions" items={ITEMS} />);

    fireEvent.click(screen.getByRole("button", { name: "Project actions" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Project actions" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(ITEMS[1].onPick).toHaveBeenCalledTimes(1);
  });
});
