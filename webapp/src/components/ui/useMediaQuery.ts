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
    return globalThis.window?.matchMedia?.(query)?.matches ?? false;
  });

  useEffect(() => {
    const mediaWindow = globalThis.window;
    const matchMedia = mediaWindow?.matchMedia;
    if (!mediaWindow || !matchMedia) return;
    const mql = matchMedia.call(mediaWindow, query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    // Minimal test mocks (and very old engines) may only offer addListener.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    if (mql.addListener) {
      mql.addListener(onChange);
      return () => mql.removeListener(onChange);
    }
  }, [query]);

  return matches;
}
