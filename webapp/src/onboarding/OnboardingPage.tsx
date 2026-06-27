import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "wasp/client/auth";
import { setPreferredName, completeOnboarding } from "wasp/client/operations";
import "./OnboardingPage.css";

/**
 * Onboarding — shown once to brand-new users to get them to the magic moment.
 *
 * Three panels teach the real loop (not the mobile-gesture prototype lessons
 * the webapp never implemented): Capture → Triage → Focus. Completion flips
 * `User.hasSeenOnboarding` server-side, so the gate survives a device/browser
 * switch (the old localStorage gate didn't).
 */

type Page = "name" | "step-1" | "step-2" | "step-3";

const PAGES: Page[] = ["name", "step-1", "step-2", "step-3"];

// The real loop, in three one-sentence panels. Each pairs a single line with a
// minimal visual — no coachmarks, no tutorial-on-the-tutorial.
const STEPS: { eyebrow: string; title: string; body: string; visual: "capture" | "triage" | "focus" }[] = [
  {
    eyebrow: "1 of 3 · capture",
    title: "Press ⌘K. Type a thought. Hit Enter.",
    body: "Anything landing in your head goes in the Inbox first. It doesn't have to be a task yet — it just has to leave your mind.",
    visual: "capture",
  },
  {
    eyebrow: "2 of 3 · triage",
    title: "Decide what each thing becomes.",
    body: "Open the Inbox and sort: is it a task, a project, a someday-maybe? One key per decision. The Inbox clears as you go.",
    visual: "triage",
  },
  {
    eyebrow: "3 of 3 · focus",
    title: "What Now picks the next thing.",
    body: "Do it. Everything else disappears until it's that thing's turn. That's the whole app.",
    visual: "focus",
  },
];

const ONBOARDING_KEY = "actionamp_onboarding_complete"; // kept only to short-circuit a re-flash before the server flag lands

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
      />
      <button
        className="aa-ob-cta aa-ob-cta--inline"
        disabled={saving}
        onClick={submit}
      >
        Looks good →
      </button>
    </div>
  );
}

/** Minimal loop visuals — calm, one shape each, no animated fingers. */
function LoopVisual({ kind }: { kind: "capture" | "triage" | "focus" }) {
  if (kind === "capture") {
    return (
      <div className="aa-ob-loop-visual aa-ob-loop-capture">
        <span className="aa-ob-kbd">⌘K</span>
        <span className="aa-ob-capture-line">a thought…</span>
      </div>
    );
  }
  if (kind === "triage") {
    return (
      <div className="aa-ob-loop-visual aa-ob-loop-triage">
        <div className="aa-ob-triage-row">
          <span className="aa-ob-triage-text">Call Sam</span>
          <span className="aa-ob-triage-key">T</span>
        </div>
        <div className="aa-ob-triage-row">
          <span className="aa-ob-triage-text">Plan Q3</span>
          <span className="aa-ob-triage-key">P</span>
        </div>
      </div>
    );
  }
  // focus
  return (
    <div className="aa-ob-loop-visual aa-ob-loop-focus">
      <div className="aa-ob-focus-card">
        <div className="aa-ob-focus-check" aria-hidden="true">
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
        <span className="aa-ob-focus-text">Email Sarah</span>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const [pageIdx, setPageIdx] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const currentPage = PAGES[pageIdx];
  const stepIdx = pageIdx - 1; // name(0) → -1; steps start at idx 1

  const finish = useCallback(async () => {
    // Persist the flag server-side so onboarding shows exactly once across
    // devices. Swallow errors: even if the write fails, the client routes to
    // /app and the next load will retry (the gate is the server flag, not
    // this call's success).
    setCompleting(true);
    setLeaving(true);
    try {
      await completeOnboarding();
      try {
        localStorage.setItem(ONBOARDING_KEY, "true");
      } catch {
        /* ignore storage errors */
      }
    } catch {
      /* non-fatal: the server gate is authoritative; worst case it re-shows once */
    } finally {
      setCompleting(false);
    }
    navigate("/app");
  }, [navigate]);

  const next = useCallback(() => {
    if (pageIdx >= PAGES.length - 1) {
      void finish();
    } else {
      setPageIdx(pageIdx + 1);
    }
  }, [pageIdx, finish]);

  // keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (pageIdx === 0) return; // name page manages its own input keys
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" && pageIdx > 0) {
        e.preventDefault();
        setPageIdx(pageIdx - 1);
      } else if (e.key === "Escape") {
        void finish();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pageIdx, next, finish]);

  return (
    <div className={`aa-onboarding ${leaving ? "leaving" : ""}`}>
      <div className="aa-ob-bg" />

      {/* Skip link — skips straight to /app, still flips the server flag */}
      <button
        className="aa-ob-skip"
        onClick={() => void finish()}
        disabled={completing}
      >
        I'll figure it out
      </button>

      <div className="aa-ob-stage">
        {/* NAME — preferred name prompt (step 0) */}
        {currentPage === "name" && (
          <NameStep user={user} onAdvance={next} />
        )}

        {/* LOOP STEPS */}
        {stepIdx >= 0 && stepIdx < STEPS.length && (
          <div className="aa-ob-page aa-ob-enter" key={stepIdx}>
            <div className="aa-ob-eyebrow">{STEPS[stepIdx].eyebrow}</div>
            <h2 className="aa-ob-h2">{STEPS[stepIdx].title}</h2>
            <p className="aa-ob-body">{STEPS[stepIdx].body}</p>

            <LoopVisual kind={STEPS[stepIdx].visual} />

            <div className="aa-ob-dots">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`aa-ob-dot ${i === stepIdx ? "active" : ""}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer CTA — hidden on the name step (it renders its own button) */}
      {currentPage !== "name" && (
        <div className="aa-ob-foot">
          <button
            className="aa-ob-cta"
            onClick={next}
            disabled={completing}
          >
            {stepIdx >= STEPS.length - 1 ? "Go →" : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Check if onboarding has been completed.
 * Kept for backwards-compat; the authoritative gate is now the server-side
 * `User.hasSeenOnboarding` flag (read in App.tsx via useAuth). This helper
 * reads the legacy localStorage stamp only.
 */
export function hasCompletedOnboarding(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "true";
  } catch {
    return false;
  }
}
