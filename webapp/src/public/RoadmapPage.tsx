import { Link } from "react-router";
import { PublicLayout } from "../shared/PublicLayout";
import "./RoadmapPage.css";

/**
 * /roadmap — a public, in-the-open view of build progress.
 *
 * Three sections, in ActionAmp's own Now/Next/Later vocabulary:
 *   1. Phase rail  — Foundation (shipped) → Road to MVP (now) → Q3 2026 (planned)
 *   2. Now/Next/Later trio — what's in flight, what's gated on a signal,
 *      what's queued for after.
 *   3. Shipped timeline — large trunks only, newest first.
 *
 * Content is hand-curated from docs/ROADMAP.md + the commit arc. There is no
 * auto-generation: a stale hand-edited page beats an honest-looking lie spun
 * from commit titles. Update it when the trunks move, not on every commit.
 *
 * Tone rules (held here): no dates on future work beyond the phase label,
 * no "coming soon," no countdowns — see the closer line.
 */
export function RoadmapPage() {
  return (
    <PublicLayout>
      <div className="aa-roadmap">
        {/* ───────────── Hero ───────────── */}
        <header className="aa-roadmap-hero">
          <h1>Building in the open</h1>
          <p className="aa-roadmap-lede">
            What we're building, what shipped, where we're headed. ActionAmp is
            soft-launched and self-funded — this page is the honest version of
            the roadmap, not a feature wishlist.
          </p>
          <div className="aa-roadmap-stats">
            <span className="aa-roadmap-stat">
              <strong>213</strong> commits
            </span>
            <span className="aa-roadmap-stat">
              <strong>6</strong> major trunks
            </span>
            <span className="aa-roadmap-stat">Jun 16 → today</span>
          </div>
        </header>

        {/* ───────────── Phase rail ───────────── */}
        <section className="aa-roadmap-phases">
          <div className="aa-roadmap-section-head">
            <h2>Phases</h2>
            <span className="aa-roadmap-rule" />
          </div>
          <div className="aa-roadmap-rail">
            <div className="aa-roadmap-phase">
              <div className="aa-roadmap-node aa-roadmap-node--done">✓</div>
              <div className="aa-roadmap-phase-label">Foundation</div>
              <div className="aa-roadmap-phase-state">Shipped · Jun 16</div>
            </div>
            <div className="aa-roadmap-phase">
              <div className="aa-roadmap-node aa-roadmap-node--current">●</div>
              <div className="aa-roadmap-phase-label">Road to MVP</div>
              <div className="aa-roadmap-phase-state aa-roadmap-phase-state--current">
                In progress
              </div>
            </div>
            <div className="aa-roadmap-phase">
              <div className="aa-roadmap-node aa-roadmap-node--planned">○</div>
              <div className="aa-roadmap-phase-label">Q3 2026</div>
              <div className="aa-roadmap-phase-state">Planned</div>
            </div>
          </div>
        </section>

        {/* ───────────── Now / Next / Later trio ───────────── */}
        <section>
          <div className="aa-roadmap-section-head">
            <h2>Now · Next · Later</h2>
            <span className="aa-roadmap-rule" />
          </div>
          <div className="aa-roadmap-trio">
            {/* NOW */}
            <article className="aa-roadmap-card aa-roadmap-card--now">
              <div className="aa-roadmap-card-head">
                <span className="aa-roadmap-card-title">Now</span>
                <span className="aa-roadmap-card-tag">Road to MVP</span>
              </div>
              <ul className="aa-roadmap-items">
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--progress" />
                  <span>
                    <span className="aa-roadmap-item-name">Observability</span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      One privacy-respecting tracker; the funnel number.
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--progress" />
                  <span>
                    <span className="aa-roadmap-item-name">Quiet launch</span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      Put the product in front of ~500 of the right people.
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--progress" />
                  <span>
                    <span className="aa-roadmap-item-name">In-app feedback</span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      Live — context-aware capture to the team inbox.
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--progress" />
                  <span>
                    <span className="aa-roadmap-item-name">Google sign-in</span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      Code-ready; gating on the OAuth client config.
                    </span>
                  </span>
                </li>
              </ul>
            </article>

            {/* NEXT */}
            <article className="aa-roadmap-card">
              <div className="aa-roadmap-card-head">
                <span className="aa-roadmap-card-title">Next</span>
                <span className="aa-roadmap-card-tag">Post-signal</span>
              </div>
              <ul className="aa-roadmap-items">
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Moment-aware matcher v2
                    </span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      Time + energy re-rank within a priority tier.
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Command palette + search
                    </span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      Fuzzy jump/run across everything.
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Retention critical-path
                    </span>
                    <br />
                    <span className="aa-roadmap-item-note">
                      First-7-days funnel; close the dead-ends.
                    </span>
                  </span>
                </li>
              </ul>
            </article>

            {/* LATER */}
            <article className="aa-roadmap-card">
              <div className="aa-roadmap-card-head">
                <span className="aa-roadmap-card-title">Later</span>
                <span className="aa-roadmap-card-tag">Q3 2026</span>
              </div>
              <ul className="aa-roadmap-items">
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Project-owned resources
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Weekly & monthly review
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">Merged Work area</span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">
                      Goal & project lifecycle
                    </span>
                  </span>
                </li>
                <li className="aa-roadmap-item">
                  <span className="aa-roadmap-dot aa-roadmap-dot--planned" />
                  <span>
                    <span className="aa-roadmap-item-name">CLI + agent skills</span>
                  </span>
                </li>
              </ul>
            </article>
          </div>
        </section>

        {/* ───────────── Shipped timeline ───────────── */}
        <section className="aa-roadmap-shipped">
          <div className="aa-roadmap-section-head">
            <h2>Shipped</h2>
            <span className="aa-roadmap-rule" />
          </div>
          <div className="aa-roadmap-timeline">
            <ShippedEntry
              date="Jul 3"
              trunk="Entitlements + custom lenses"
              summary="Free-tier caps enforced server-side and surfaced as calm Pro moments. Lenses became first-class: kinds, identity colors, Pro CRUD, adaptive switcher."
            />
            <ShippedEntry
              date="Jun 30"
              trunk="Capture polish + lens theming"
              summary="Rapid-fire capture with token parsing, per-lens identity color across the shell, mobile thumb-zone dock, in-app feedback, and signup CTAs on the landing page."
            />
            <ShippedEntry
              date="Jun 27"
              trunk="First-run, auth, friction cleanup"
              summary="Onboarding routes new users to a magic moment; OAuth-ready legal pages; the honest 'why this?' line under Next; Someday promote, Goal detail, Today's Done section."
            />
            <ShippedEntry
              date="Jun 25"
              trunk="Project detail + triage wizard"
              summary="A project page to work its tasks inline. Triage became a co-author wizard with lossless Archive — nothing is ever silently deleted."
            />
            <ShippedEntry
              date="Jun 22"
              trunk="Founding 100 + test suite"
              summary="Capped lifetime tier with live Stripe checkout and a real spots-remaining count. Vitest + Playwright stood up; the suite went green and stayed green."
            />
            <ShippedEntry
              date="Jun 16"
              trunk="Foundation"
              summary="Design system, the full core loop (capture → triage → Next → Today → Logbook), deploy to Railway on a custom domain, and the polished landing page."
            />
          </div>
        </section>

        {/* ───────────── Closer ───────────── */}
        <section className="aa-roadmap-closer">
          <p>
            No countdowns, no launch dates until the numbers say go. When the
            funnel earns it, this page is where the next phase opens.
          </p>
          <Link to="/founding-100">Become a Founding Member →</Link>
        </section>
      </div>
    </PublicLayout>
  );
}

function ShippedEntry({
  date,
  trunk,
  summary,
}: {
  date: string;
  trunk: string;
  summary: string;
}) {
  return (
    <div className="aa-roadmap-entry">
      <div className="aa-roadmap-entry-date">{date}</div>
      <div className="aa-roadmap-entry-body">
        <div className="aa-roadmap-entry-trunk">{trunk}</div>
        <div className="aa-roadmap-entry-summary">{summary}</div>
      </div>
    </div>
  );
}
