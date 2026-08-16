import { useEffect, useState } from "react";

/**
 * useMediaQuery — reactive CSS media query for JS-rendered branches (overlay
 * mode swaps that CSS alone can't switch, e.g. popover → bottom sheet).
 *
 * jsdom doesn't implement window.matchMedia; absence resolves to `false`
 * (desktop) so component tests render the default branch without a mock.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    // Minimal test mocks (and very old engines) may only offer addListener.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    if (typeof mql.addListener === "function") {
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    }
  }, [query]);

  return matches;
}
