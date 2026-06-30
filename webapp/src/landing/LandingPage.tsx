import { useState, useCallback } from "react";
import { Link } from "react-router";
import "./LandingPage.css";
// Design-system Button styles — so the landing CTA uses the real .aa-btn--*
// classes instead of a bespoke copy. Imported for its CSS side effect.
import "../components/ui/Button.css";

const HERO_TASKS = [
  {
    title: "Email Sarah re: Q3 invoice",
    why: "★ Important · the reason this is next",
    meta: "Due today · 15 min",
  },
  {
    title: "Review pull request #284",
    why: "Normal · fits in 30 min",
    meta: "Due today · 30 min",
  },
  {
    title: "Prep notes for 1:1 with Marco",
    why: "Low · quick win",
    meta: "Tomorrow · 10 min",
  },
  {
    title: "Reply to legal re: contract",
    why: "★ Important · overdue",
    meta: "Was due yesterday",
  },
  {
    title: "Draft the Q3 launch plan",
    why: "Important · break it down",
    meta: "This week · XL",
  },
];

const FAQ_ITEMS = [
  {
    q: "Is this just another todo app?",
    a: 'No. The list is demoted. "What do I do next?" is the home screen. ActionAmp optimizes the decision, not the capture.',
  },
  {
    q: "Do I need to know GTD?",
    a: "No. The methodology is there if you want it, invisible if you don't. Most users just capture, triage, and do.",
  },
  {
    q: "When does it launch?",
    a: "Soon. When it's ready, you'll know.",
  },
];

export function LandingPage() {
  const [taskIdx, setTaskIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const task = HERO_TASKS[taskIdx % HERO_TASKS.length];

  const handleComplete = useCallback(() => {
    if (done) return;
    setDone(true);
    setTimeout(() => {
      setDone(false);
      setTaskIdx((i) => i + 1);
    }, 2400);
  }, [done]);

  return (
    <div className="aa-landing">
      <nav className="aa-nav">
        <Link to="/" className="aa-brand" aria-label="ActionAmp home">
          <div className="aa-brand-mark">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="aa-brand-name">ActionAmp</span>
        </Link>
        <div className="aa-nav-links">
          <a className="aa-nav-link" href="#how">
            How it works
          </a>
          <a className="aa-nav-link" href="#soul">
            Why
          </a>
          <a className="aa-nav-link" href="#method">
            Methodology
          </a>
          <a className="aa-nav-link" href="#faq">
            FAQ
          </a>
        </div>
        <div className="aa-nav-auth">
          <Link to="/login" className="aa-nav-link aa-nav-link-auth">
            Log in
          </Link>
        </div>
      </nav>

      <section className="aa-hero">
        <div className="aa-chaos" aria-hidden="true">
          <div className="aa-chaos-row">
            <span className="aa-c-box" />
            something
          </div>
          <div className="aa-chaos-row">
            <span className="aa-c-box" />
            another thing
          </div>
          <div className="aa-chaos-row">
            <span className="aa-c-box" />
            don't forget
          </div>
          <div className="aa-chaos-row">
            <span className="aa-c-box" />
            and this
          </div>
        </div>

        <div className="aa-hero-grid">
          <div className="aa-hero-text">
            <span className="aa-hero-eyebrow">
              <span className="aa-dot" />A focus app, not a todo app
            </span>
            <h1>
              <span className="aa-light">Easiest way</span>
              <br />
              to get <span className="aa-accent">into action</span>.
            </h1>
            <p className="aa-hero-sub">
              Every other app opens to your list. ActionAmp opens to the{" "}
              <b>one thing</b> to do next.
            </p>
            <div className="aa-hero-meta">
              <span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <rect
                    x="2"
                    y="3"
                    width="12"
                    height="10"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M5 6h2M9 6h2M5 9h6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                Keyboard-first
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Calm by default
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M2 8c0-3 2-6 6-6s6 3 6 6-2 6-6 6-6-3-6-6z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
                GTD-compatible
              </span>
            </div>
            <Link
              to="/signup"
              className="aa-btn aa-btn--primary aa-btn--lg aa-hero-cta"
            >
              Make an account
            </Link>
          </div>

          <div className="aa-wn-wrap">
            <div className="aa-wn-card">
              <div className="aa-wn-ctx">
                <span className="aa-dot" />
                Right now · 30 min
              </div>
              <button
                className={`aa-completion ${done ? "filled burst" : ""}`}
                onClick={handleComplete}
                aria-label={done ? "Task complete" : "Mark task complete"}
                title="Click to complete"
              >
                <svg className="aa-check" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="aa-wn-title" key={taskIdx}>
                {task.title}
              </div>
              <div className="aa-wn-meta">{task.meta}</div>
              <div className="aa-wn-why">{task.why}</div>
              <div className="aa-wn-actions">
                <button
                  className={`aa-btn aa-btn--primary ${done ? "is-done" : ""}`}
                  onClick={handleComplete}
                >
                  {done ? "Done ✓" : "Do this"}
                </button>
                <button className="aa-btn aa-btn--secondary">Switch</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="aa-section aa-problem">
        <div className="aa-eyebrow">The expectation</div>
        <h2 className="aa-display">
          <span className="aa-light">Your app should</span> support your focus.
        </h2>
        <p className="aa-lede">
          Most apps optimize <b>capture</b>, writing things down. None optimize
          the <b>decision</b>: of all this, what do I do right now?
        </p>
        <p className="aa-lede">
          The list grows faster than you can work it. You don't fail to capture.
          You fail to <b>pick</b>. A list that doesn't help you pick isn't
          helping you focus, it's just nagging.
        </p>
        <p className="aa-lede aa-lede-punch">
          So we made something that does the picking for you.
        </p>
      </section>

      <section className="aa-section aa-how" id="how">
        <div className="aa-eyebrow">How it works</div>
        <h2 className="aa-display">
          <span className="aa-light">Three moves,</span> not three hundred
          features.
        </h2>
        <div className="aa-flow">
          <div className="aa-flow-step">
            <div className="aa-flow-num">01</div>
            <h3>Capture</h3>
            <p>Thought goes to inbox in under two seconds. From anywhere.</p>
          </div>
          <div className="aa-flow-arrow">
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <path
                d="M2 7h15M13 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="aa-flow-step">
            <div className="aa-flow-num">02</div>
            <h3>Triage</h3>
            <p>
              Decide what each thing <i>is</i>: task, project, or reference.
            </p>
          </div>
          <div className="aa-flow-arrow">
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <path
                d="M2 7h15M13 2l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="aa-flow-step">
            <div className="aa-flow-num">03</div>
            <h3>Focus</h3>
            <p>
              ActionAmp picks the next thing. You do it. The rest disappears.
            </p>
          </div>
        </div>
      </section>

      <section className="aa-soul" id="soul">
        <h2 className="aa-soul-statement">
          The home screen isn't a list.
          <br />
          It's a <b>decision</b>.
        </h2>
        <p className="aa-soul-sub">
          Every other app opens to your full todo list. ActionAmp opens to one
          task, the next thing that matters, and hides the rest. You can always
          see it. You just don't have to.
        </p>
      </section>

      <section className="aa-section aa-method" id="method">
        <div className="aa-eyebrow">Methodology</div>
        <h2 className="aa-display">
          GTD-compatible. <span className="aa-light">Built for action.</span>
        </h2>
        <p className="aa-lede">
          If you know <b>Getting Things Done</b>, you're home: inbox, triage,
          projects, someday. If you don't, none of that matters, the app still
          just works.
        </p>
        <p className="aa-lede">
          We also borrowed from <b>PARA</b>, with one deliberate change: we took
          its <b>Areas</b> and called them <b>Goals</b>. Not the same, but
          similar. Areas are passive buckets ("Health", "Finance"). Goals are
          active outcomes ("Run a 10k", "Get finances under control"). For an
          app about action, the active framing fits.
        </p>
        <div className="aa-badges">
          <span className="aa-badge">
            <span className="aa-b">/</span>Inbox → triage
          </span>
          <span className="aa-badge">
            <span className="aa-b">/</span>Goals over areas
          </span>
          <span className="aa-badge">
            <span className="aa-b">/</span>Projects & tasks
          </span>
          <span className="aa-badge">
            <span className="aa-b">/</span>Priority + size
          </span>
        </div>
      </section>

      <section className="aa-section aa-faq-section" id="faq">
        <div className="aa-eyebrow">FAQ</div>
        <h2 className="aa-display aa-display-sm">Honest answers.</h2>
        <div className="aa-faq-list">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className={`aa-faq-item ${openFaq === i ? "open" : ""}`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="aa-faq-q">{item.q}</div>
              <div className="aa-faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="aa-final">
        <div className="aa-final-mark">
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2>
          Do the <b>next thing</b>.<br />
          Not all the things.
        </h2>
        <p>Free while we're in beta.</p>
        <div className="aa-final-cta">
          <Link
            to="/signup"
            className="aa-btn aa-btn--primary aa-btn--lg aa-final-cta-btn"
          >
            Make an account
          </Link>
          <span className="aa-final-login">
            Already use it? <Link to="/login">Log in</Link>
          </span>
        </div>
      </section>

      <footer className="aa-footer">
        <Link to="/" className="aa-brand" aria-label="ActionAmp home">
          <div className="aa-brand-mark aa-brand-mark-sm">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path
                d="M3.5 8.5l3 3 6-7"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="aa-brand-name aa-brand-name-sm">ActionAmp</span>
        </Link>
        <div className="aa-footer-links">
          <Link to="/about">About</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/founding-100">Founding 100</Link>
        </div>
        <div className="aa-footer-copy">© 2026 ActionAmp</div>
      </footer>
    </div>
  );
}
