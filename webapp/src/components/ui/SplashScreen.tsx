import { useEffect, useRef, useState } from "react";
import "./SplashScreen.css";

/** Minimum time the veil stays up once shown — protects against a blink
 * when the session and first data resolve almost instantly. */
const MIN_ACTIVE_MS = 450;
/** Fade-out duration; keep in sync with the transition in SplashScreen.css. */
const EXIT_MS = 400;

type SplashPhase = "active" | "leaving" | "gone";

interface SplashScreenProps {
  /** Whether the veil covers the screen. Flipping to false starts the exit:
   * hold the minimum display time, fade out over the app, unmount. */
  active?: boolean;
  /** Headline under the mark. */
  label?: string;
}

/**
 * SplashScreen — the calm welcome veil between a recognized login and the app.
 *
 * Covers the seams where the session or first data is still resolving: the
 * blank layout during auth resolution (App.tsx), the "What now / …"
 * placeholder during the first data load (NextPage.tsx), and the login form
 * flash while a returning session is being checked (PasswordlessAuthPage).
 *
 * The container is opaque from the first frame (no fade-in), so handoffs
 * between those seams never flash the page beneath — each seam mounts its own
 * veil and the swap is invisible. Only the exit is animated.
 */
export function SplashScreen({ active = true, label = "Welcome back." }: SplashScreenProps) {
  const [phase, setPhase] = useState<SplashPhase>(active ? "active" : "gone");
  const activatedAt = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      if (phase === "gone") {
        setPhase("active");
        activatedAt.current = Date.now();
      }
      return;
    }
    if (phase !== "active") return;
    const elapsed = Date.now() - (activatedAt.current ?? 0);
    const holdFor = Math.max(0, MIN_ACTIVE_MS - elapsed);
    const timer = window.setTimeout(() => setPhase("leaving"), holdFor);
    return () => window.clearTimeout(timer);
  }, [active, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;

  return (
    <div
      className={`aa-splash${phase === "leaving" ? " aa-splash--leaving" : ""}`}
      role="status"
      aria-label={label}
    >
      <div className="aa-splash__mark" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
          <path
            d="M3.5 8.5l3 3 6-7"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="aa-splash__label">{label}</p>
      <span className="aa-splash__pulse" aria-hidden="true" />
    </div>
  );
}
