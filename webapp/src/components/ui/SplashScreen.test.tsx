import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SplashScreen } from "./SplashScreen";

/**
 * SplashScreen — the welcome veil between a recognized login and the app.
 *
 * These tests pin the self-managing lifecycle: opaque while `active`, a
 * minimum display time (blink protection), a fade-out phase, then unmount.
 */

describe("SplashScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("covers the screen while active", () => {
    render(<SplashScreen />);

    expect(screen.getByText("Welcome back.")).toBeInTheDocument();
    expect(document.querySelector(".aa-splash")).not.toHaveClass("aa-splash--leaving");
  });

  it("renders nothing when mounted inactive", () => {
    const { container } = render(<SplashScreen active={false} />);

    expect(container.querySelector(".aa-splash")).not.toBeInTheDocument();
  });

  it("holds the minimum display time before fading out", () => {
    const { rerender } = render(<SplashScreen />);
    rerender(<SplashScreen active={false} />);

    // Still fully visible right after deactivation (blink protection).
    expect(document.querySelector(".aa-splash")).not.toHaveClass("aa-splash--leaving");

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(document.querySelector(".aa-splash")).toHaveClass("aa-splash--leaving");
  });

  it("unmounts after the fade completes", () => {
    const { container, rerender } = render(<SplashScreen />);
    rerender(<SplashScreen active={false} />);

    // Hold, fade, gone — stepped so each phase's timer is scheduled by the
    // previous one (the exit timer only exists once "leaving" renders).
    act(() => {
      vi.advanceTimersByTime(450);
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(container.querySelector(".aa-splash")).not.toBeInTheDocument();
  });
});
