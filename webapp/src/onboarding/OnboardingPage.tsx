import { useState, useEffect, useCallback } from "react";
import { useAuth } from "wasp/client/auth";
import { setPreferredName } from "wasp/client/operations";
import "./OnboardingPage.css";

type Page =
  | "name"
  | "welcome"
  | "lesson-1"
  | "lesson-2"
  | "lesson-3"
  | "lesson-4"
  | "done";

const PAGES: Page[] = [
  "name",
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

/**
 * Step 0: preferred-name prompt. Self-contained — owns its input, save, and
 * submit button so the carousel shell stays a pure orchestrator.
 * ponytail: save failures are swallowed — onboarding must never block on a
 * network hiccup; the name is re-editable in Settings.
 */
function NameStep({
  user,
  onAdvance,
}: {
  user: { firstName?: string } | null | undefined;
  onAdvance: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    const name = value.trim() || user?.firstName;
    if (name) {
      setSaving(true);
      try {
        await setPreferredName({ preferredName: name });
      } catch {
        /* non-fatal */
      } finally {
        setSaving(false);
      }
    }
    onAdvance();
  }, [value, user, onAdvance]);

  return (
    <div className="aa-ob-page aa-ob-enter">
      <div className="aa-ob-eyebrow">First, a quick hello</div>
      <h1 className="aa-ob-h1">What should we call you?</h1>
      <p className="aa-ob-body">
        First name, nickname, whatever feels right. You can change it later in
        Settings.
      </p>
      <input
        className="aa-ob-name-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={user?.firstName ?? "Your name"}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "12px 14px",
          fontSize: "1.05rem",
          borderRadius: 10,
          border: "1px solid var(--aa-border-strong, #ccc)",
          background: "var(--aa-surface, #fff)",
          color: "var(--aa-text, #111)",
          marginTop: 8,
        }}
      />
      <button
        className="aa-ob-cta"
        disabled={saving}
        onClick={submit}
        style={{ marginTop: 24 }}
      >
        Looks good →
      </button>
    </div>
  );
}

export function OnboardingPage() {
  const { data: user } = useAuth();
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
      if (pageIdx === 0) return; // name page manages its own input keys
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
  const lessonIdx = pageIdx - 2; // name(0)/welcome(1) → negative, lessons start at idx 2

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
        {/* NAME — preferred name prompt (step 0) */}
        {currentPage === "name" && (
          <NameStep user={user} onAdvance={next} />
        )}

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
              {PAGES.slice(2).map((_, i) => (
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

      {/* Footer CTA — hidden on the name step (it renders its own button) */}
      {currentPage !== "name" && (
        <div className="aa-ob-foot">
          {!isDone ? (
            <button
              className="aa-ob-cta"
              onClick={
                currentPage === "welcome"
                  ? next
                  : pageIdx >= PAGES.length - 1
                    ? complete
                    : next
              }
            >
              {currentPage === "welcome"
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
      )}
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
