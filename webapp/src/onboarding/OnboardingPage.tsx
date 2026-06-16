import { useState, useEffect, useCallback } from "react";
import "./OnboardingPage.css";

type Page =
  | "welcome"
  | "lesson-1"
  | "lesson-2"
  | "lesson-3"
  | "lesson-4"
  | "done";

const PAGES: Page[] = [
  "welcome",
  "lesson-1",
  "lesson-2",
  "lesson-3",
  "lesson-4",
];

const LESSONS = [
  {
    eyebrow: "1 of 4 · the sacred one",
    title: "Hold the card to start working.",
    body: 'A long-press says "I\'m committing to this." The card becomes the world. Everything else fades.',
  },
  {
    eyebrow: "2 of 4 · the signature",
    title: "Two-finger swipe to zoom.",
    body: "Swipe left with two fingers to zoom out: Task → Project → Goal. Swipe right to drill back in. This is how you see the bigger picture.",
  },
  {
    eyebrow: "3 of 4 · the rhythm",
    title: "Swipe sideways for Plan, Do, Review.",
    body: "Morning = Plan. Midday = Do. Evening = Review. One finger, left or right on the card, to shift your mode.",
  },
  {
    eyebrow: "4 of 4 · the escape hatch",
    title: "Tap the breadcrumb to jump.",
    body: "Any time, tap Grow audience › Ship product v2 › Email Sarah to leap straight to a scope. No gestures required.",
  },
];

const FINAL_MSG = "That's it. Go do something.";

const ONBOARDING_KEY = "actionamp_onboarding_complete";

export function OnboardingPage() {
  const [pageIdx, setPageIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const currentPage = PAGES[pageIdx];

  const complete = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setLeaving(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 400);
  }, []);

  const next = useCallback(() => {
    if (pageIdx >= PAGES.length - 1) {
      setPageIdx(PAGES.length); // triggers "done"
    } else {
      setPageIdx(pageIdx + 1);
    }
  }, [pageIdx]);

  const skip = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setLeaving(true);
    setTimeout(() => {
      window.location.href = "/";
    }, 400);
  }, []);

  // keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (pageIdx >= PAGES.length - 1) complete();
        else next();
      } else if (e.key === "ArrowLeft" && pageIdx > 0) {
        e.preventDefault();
        setPageIdx(pageIdx - 1);
      } else if (e.key === "Escape") {
        skip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pageIdx, next, complete, skip]);

  const isDone = pageIdx >= PAGES.length;
  const lessonIdx = pageIdx - 1; // -1 = welcome page

  return (
    <div className={`aa-onboarding ${leaving ? "leaving" : ""}`}>
      <div className="aa-ob-bg" />

      {/* Skip link */}
      {!isDone && (
        <button className="aa-ob-skip" onClick={skip}>
          I'll figure it out
        </button>
      )}

      {/* Pages */}
      <div className="aa-ob-stage">
        {/* WELCOME */}
        {currentPage === "welcome" && (
          <div className="aa-ob-page aa-ob-enter">
            <div className="aa-ob-brand">
              <div className="aa-brand-mark">
                <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="aa-ob-eyebrow">Welcome to ActionAmp</div>
            <h1 className="aa-ob-h1">
              We're special.
              <br />
              Let's teach you the moves.
            </h1>
            <p className="aa-ob-body">
              This isn't another list of checkboxes. It's a focus tool with its
              own way of moving. Four quick gestures — about 30 seconds.
            </p>
            <div className="aa-ob-dots">
              <span className={`aa-ob-dot active`} />
              <span className="aa-ob-dot" />
              <span className="aa-ob-dot" />
              <span className="aa-ob-dot" />
              <span className="aa-ob-dot" />
            </div>
          </div>
        )}

        {/* LESSONS */}
        {lessonIdx >= 0 && lessonIdx < LESSONS.length && (
          <div className="aa-ob-page aa-ob-enter" key={lessonIdx}>
            <div className="aa-ob-eyebrow">{LESSONS[lessonIdx].eyebrow}</div>
            <h2 className="aa-ob-h2">{LESSONS[lessonIdx].title}</h2>
            <p
              className="aa-ob-body"
              dangerouslySetInnerHTML={{
                __html: LESSONS[lessonIdx].body.replace(
                  /<b>/g,
                  '<b class="aa-ob-bold">',
                ),
              }}
            />

            {/* Gesture demo */}
            <div className="aa-ob-demo">
              <div className="aa-ob-demo-card">
                <div className="aa-ob-demo-circle" />
                <div className="aa-ob-demo-text">Email Sarah</div>
              </div>

              {/* Lesson 1: long-press finger */}
              {lessonIdx === 0 && (
                <div className="aa-ob-finger aa-ob-finger-hold" />
              )}

              {/* Lesson 2: two-finger swipe */}
              {lessonIdx === 1 && (
                <>
                  <div className="aa-ob-finger aa-ob-finger-swipe-1" />
                  <div className="aa-ob-finger aa-ob-finger-swipe-2 aa-ob-finger-amber" />
                </>
              )}

              {/* Lesson 3: one-finger swipe */}
              {lessonIdx === 2 && (
                <div className="aa-ob-finger aa-ob-finger-single-swipe" />
              )}

              {/* Lesson 4: breadcrumb pulse */}
              {lessonIdx === 3 && (
                <div className="aa-ob-breadcrumb-demo">
                  <span className="aa-ob-bc-item">Grow audience</span>
                  <span className="aa-ob-bc-sep">›</span>
                  <span className="aa-ob-bc-item">Ship product v2</span>
                  <span className="aa-ob-bc-sep">›</span>
                  <span className="aa-ob-bc-item aa-ob-bc-current">
                    Email Sarah
                  </span>
                </div>
              )}
            </div>

            <div className="aa-ob-dots">
              {PAGES.slice(1).map((_, i) => (
                <span
                  key={i}
                  className={`aa-ob-dot ${i === lessonIdx ? "active" : ""}`}
                />
              ))}
            </div>
          </div>
        )}

        {/* DONE */}
        {isDone && (
          <div className="aa-ob-page aa-ob-enter aa-ob-done-page">
            <div className="aa-ob-done-circle">
              <svg viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.5 8.5l3 3 6-7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="aa-ob-h2 aa-ob-final">{FINAL_MSG}</h2>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="aa-ob-foot">
        {!isDone ? (
          <button
            className="aa-ob-cta"
            onClick={
              pageIdx === 0
                ? next
                : pageIdx >= PAGES.length - 1
                  ? complete
                  : next
            }
          >
            {pageIdx === 0
              ? "Show me →"
              : pageIdx >= PAGES.length - 1
                ? FINAL_MSG
                : "Next →"}
          </button>
        ) : (
          <button className="aa-ob-cta" onClick={complete}>
            Go →
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Check if onboarding has been completed.
 * Uses localStorage for now; will move to a User.hasSeenOnboarding flag
 * once the schema exists. TODO: replace when schema is built.
 */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}
