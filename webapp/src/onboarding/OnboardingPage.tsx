import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "wasp/client/auth";
import { setPreferredName, completeOnboarding } from "wasp/client/operations";
import { PlusIcon } from "../components/ui/icons";
import "./OnboardingPage.css";

/**
 * Onboarding — shown once to brand-new users to get them to the magic moment.
 *
 * Three panels teach the real loop (not the mobile-gesture prototype lessons
 * the webapp never implemented): Capture → Triage → Focus. Completion flips
 * `User.hasSeenOnboarding` server-side, so the gate survives a device/browser
 * switch (the old localStorage gate didn't).
 */

type Page = "welcome" | "name" | "capture" | "triage" | "focus";

// The real loop, in three one-sentence panels. Each pairs a single line with a
// minimal visual — no coachmarks, no tutorial-on-the-tutorial.
const STEPS: {
  page: Extract<Page, "capture" | "triage" | "focus">;
  eyebrow: string;
  title: string;
  mobileTitle?: string;
  body: string;
  visual: "capture" | "triage" | "focus";
}[] = [
  {
    page: "capture",
    eyebrow: "1 of 3 · capture",
    title: "Use ⌘K to capture a thought.",
    mobileTitle: "Capture a thought before it disappears.",
    body: "Capture is for thoughts before they become plans. Anything landing in your head goes in the Inbox first.",
    visual: "capture",
  },
  {
    page: "triage",
    eyebrow: "2 of 3 · triage",
    title: "Decide what each thing becomes.",
    body: "Some thoughts are tasks. Some are projects. Some are just later. Triage is where you decide without cluttering today.",
    visual: "triage",
  },
  {
    page: "focus",
    eyebrow: "3 of 3 · focus",
    title: "Start with one thing.",
    body: "We put a few light starter tasks on your table. Next will show them one at a time, then get out of the way.",
    visual: "focus",
  },
];

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

function WelcomeStep({ onAdvance }: { onAdvance: () => void }) {
  return (
    <div className="aa-ob-page aa-ob-enter">
      <div className="aa-ob-eyebrow">Welcome to ActionAmp</div>
      <h1 className="aa-ob-h1 aa-ob-h1--wide">
        It opens to one task, not a list.
      </h1>
      <p className="aa-ob-body aa-ob-body--intro">
        ActionAmp is built for the moment after capture: deciding what actually
        deserves your attention now.
      </p>
      <button className="aa-ob-cta aa-ob-cta--inline" onClick={onAdvance}>
        Show me →
      </button>
    </div>
  );
}

function StepTitle({
  title,
  mobileTitle,
}: {
  title: string;
  mobileTitle?: string;
}) {
  if (!mobileTitle) return <>{title}</>;
  return (
    <>
      <span className="aa-ob-title-desktop">{title}</span>
      <span className="aa-ob-title-mobile">{mobileTitle}</span>
    </>
  );
}

/** Minimal loop visuals — calm, one shape each, no animated fingers. */
function LoopVisual({ kind }: { kind: "capture" | "triage" | "focus" }) {
  // Decorative — the panel's title + body carry all the meaning, so the whole
  // visual is hidden from screen readers to avoid a noisy duplicate readout.
  if (kind === "capture") {
    return (
      <div className="aa-ob-loop-visual aa-ob-loop-capture" aria-hidden="true">
        <span className="aa-ob-kbd aa-ob-kbd--desktop">⌘K</span>
        <span className="aa-ob-mobile-capture-chip">
          <PlusIcon />
        </span>
        <span className="aa-ob-capture-line">a thought…</span>
      </div>
    );
  }
  if (kind === "triage") {
    return (
      <div className="aa-ob-loop-visual aa-ob-loop-triage" aria-hidden="true">
        <div className="aa-ob-triage-row">
          <span className="aa-ob-triage-text">Call Sam</span>
          <span className="aa-ob-triage-key">Task</span>
        </div>
        <div className="aa-ob-triage-row">
          <span className="aa-ob-triage-text">Plan Q3</span>
          <span className="aa-ob-triage-key">Project</span>
        </div>
      </div>
    );
  }
  // focus
  return (
    <div className="aa-ob-loop-visual aa-ob-loop-focus" aria-hidden="true">
      <div className="aa-ob-focus-card">
        <div className="aa-ob-focus-check">
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
  const [completionError, setCompletionError] = useState(false);

  const pages = useMemo<Page[]>(() => {
    const needsName = user ? !user.firstName?.trim() : false;
    return needsName
      ? ["welcome", "name", "capture", "triage", "focus"]
      : ["welcome", "capture", "triage", "focus"];
  }, [user]);

  const currentPage = pages[pageIdx] ?? "welcome";
  const stepIdx = STEPS.findIndex((step) => step.page === currentPage);
  const currentStep = stepIdx >= 0 ? STEPS[stepIdx] : null;

  const finish = useCallback(async () => {
    // Persist the flag server-side so onboarding shows exactly once across
    // devices. If this fails, do NOT navigate to /app — the gate in App.tsx
    // reads the same server flag, so a false flag would bounce the user right
    // back to /welcome (a redirect loop). Instead surface an error + retry.
    setCompleting(true);
    setCompletionError(false);
    try {
      await completeOnboarding();
      setLeaving(true);
      // Give useAuth a tick to refetch the invalidated User before navigating,
      // so the gate sees the updated flag and doesn't fire on /app.
      navigate("/app");
    } catch {
      setCompleting(false);
      setCompletionError(true);
      return; // stay on the last panel; let the user retry
    }
    setCompleting(false);
  }, [navigate]);

  const next = useCallback(() => {
    if (pageIdx >= pages.length - 1) {
      void finish();
    } else {
      setPageIdx(pageIdx + 1);
    }
  }, [pageIdx, pages.length, finish]);

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
        {currentPage === "welcome" && <WelcomeStep onAdvance={next} />}

        {currentPage === "name" && <NameStep user={user} onAdvance={next} />}

        {/* LOOP STEPS */}
        {currentStep && (
          <div className="aa-ob-page aa-ob-enter" key={stepIdx}>
            <div className="aa-ob-eyebrow">{currentStep.eyebrow}</div>
            <h2 className="aa-ob-h2">
              <StepTitle
                title={currentStep.title}
                mobileTitle={currentStep.mobileTitle}
              />
            </h2>
            <p className="aa-ob-body">{currentStep.body}</p>

            <LoopVisual kind={currentStep.visual} />

            <div className="aa-ob-dots">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`aa-ob-dot ${i === stepIdx ? "active" : ""}`}
                />
              ))}
            </div>

            <div className="aa-ob-actions">
              {completionError && (
                <p className="aa-ob-error" role="alert">
                  Couldn’t save — check your connection and try again.
                </p>
              )}
              <button
                className="aa-ob-cta"
                onClick={next}
                disabled={completing}
              >
                {completing
                  ? "Saving…"
                  : stepIdx >= STEPS.length - 1
                    ? "Show me my starter tasks →"
                    : "Next →"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
