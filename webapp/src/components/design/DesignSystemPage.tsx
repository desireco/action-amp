import { useState, type ReactNode } from "react";
import {
  Breadcrumb,
  BrandMark,
  Button,
  Card,
  Chip,
  CompletionCircle,
  LensSwitch,
  ModeDial,
  NavItem,
  WhatNowCard,
  ZoomDock,
  StarIcon,
  InboxIcon,
  ClockIcon,
  CalendarIcon,
  SomedayIcon,
  ProjectsIcon,
  GoalsIcon,
  LogbookIcon,
  UserIcon,
  PlusIcon,
  MoonIcon,
  SunIcon,
} from "../ui";
import "./DesignSystemPage.css";

/* ================================================================
   Data
   ================================================================ */

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "typography", label: "Typography" },
  { id: "colors", label: "Colors" },
  { id: "spacing", label: "Spacing & Radius" },
  { id: "buttons", label: "Buttons" },
  { id: "cards", label: "Cards" },
  { id: "chips", label: "Chips & Badges" },
  { id: "completion", label: "Completion Circle" },
  { id: "forms", label: "Form Elements" },
  { id: "shadows", label: "Shadows & Motion" },
  { id: "sidebar", label: "Sidebar" },
  { id: "lens", label: "Lens Switch" },
  { id: "nav-item", label: "Nav Item" },
  { id: "icons", label: "Icon Set" },
  { id: "topbar", label: "Topbar & Kbd" },
  { id: "dispatch", label: "Dispatch Buttons" },
  { id: "progress", label: "Progress Bar" },
  { id: "empty", label: "Empty States" },
  { id: "wn-card", label: "What Now Card" },
  { id: "mode-dial", label: "Mode Dial (Bottom Nav)" },
  { id: "zoom-dock", label: "Zoom Dock" },
  { id: "breadcrumb", label: "Breadcrumb" },
  { id: "overlays", label: "Overlays & Modals" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

const COLOR_GROUPS = [
  {
    name: "Teal — primary accent",
    tokens: [
      { v: "--aa-teal", label: "Teal" },
      { v: "--aa-teal-bright", label: "Bright" },
      { v: "--aa-teal-cta", label: "CTA" },
      { v: "--aa-teal-cta-hover", label: "CTA Hover" },
      { v: "--aa-teal-soft", label: "Soft" },
      { v: "--aa-teal-soft-strong", label: "Soft Strong" },
      { v: "--aa-teal-tint-shadow", label: "Tint Shadow" },
    ],
  },
  {
    name: "Amber — human emphasis (rare)",
    tokens: [
      { v: "--aa-amber", label: "Amber" },
      { v: "--aa-amber-text", label: "Text" },
      { v: "--aa-amber-soft", label: "Soft" },
      { v: "--aa-amber-soft-strong", label: "Soft Strong" },
    ],
  },
  {
    name: "Violet — projects & goals",
    tokens: [
      { v: "--aa-violet", label: "Violet" },
      { v: "--aa-violet-soft", label: "Soft" },
      { v: "--aa-violet-text", label: "Text" },
    ],
  },
  {
    name: "Rose — errors & overdue",
    tokens: [
      { v: "--aa-rose", label: "Rose" },
      { v: "--aa-rose-soft", label: "Soft" },
      { v: "--aa-rose-text", label: "Text" },
    ],
  },
  {
    name: "Neutral ramp (cool-tinted)",
    tokens: [
      { v: "--aa-bg", label: "Background" },
      { v: "--aa-bg-soft", label: "BG Soft" },
      { v: "--aa-bg-deep", label: "BG Deep" },
      { v: "--aa-surface", label: "Surface" },
      { v: "--aa-surface-muted", label: "Muted" },
      { v: "--aa-surface-muted-2", label: "Muted 2" },
      { v: "--aa-border", label: "Border" },
      { v: "--aa-border-strong", label: "Border Strong" },
      { v: "--aa-text", label: "Text" },
      { v: "--aa-text-2", label: "Text 2" },
      { v: "--aa-text-3", label: "Text 3" },
      { v: "--aa-text-4", label: "Text 4" },
    ],
  },
];

const FONT_SIZES = [
  { label: "Hero", s: { fontSize: "4.75rem", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 0.98 } },
  { label: "Display", s: { fontSize: "3.5rem", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.02 } },
  { label: "Soul statement", s: { fontSize: "4rem", fontWeight: 300, letterSpacing: "-0.025em", lineHeight: 1.08 } },
  { label: "H1", s: { fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em" } },
  { label: "H2", s: { fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.015em" } },
  { label: "Task title", s: { fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" } },
  { label: "Card title", s: { fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em" } },
  { label: "H3", s: { fontSize: "1.1rem", fontWeight: 600 } },
  { label: "Section heading", s: { fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" as const, color: "var(--aa-text-4)" } },
  { label: "Eyebrow", s: { fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "var(--aa-teal-cta)" } },
  { label: "Body", s: { fontSize: "0.95rem", color: "var(--aa-text-2)" } },
  { label: "Small", s: { fontSize: "0.85rem", color: "var(--aa-text-3)" } },
  { label: "Caption", s: { fontSize: "0.75rem", color: "var(--aa-text-4)" } },
] as const;

const SPACING = [
  { t: "--aa-space-xs", v: "4px" },
  { t: "--aa-space-sm", v: "8px" },
  { t: "--aa-space-md", v: "16px" },
  { t: "--aa-space-lg", v: "24px" },
  { t: "--aa-space-xl", v: "32px" },
  { t: "--aa-space-2xl", v: "48px" },
  { t: "--aa-space-3xl", v: "64px" },
  { t: "--aa-space-4xl", v: "96px" },
] as const;

const RADII = [
  { t: "--aa-radius-xs", v: "4px" },
  { t: "--aa-radius-sm", v: "6px" },
  { t: "--aa-radius-md", v: "8px" },
  { t: "--aa-radius-lg", v: "12px" },
  { t: "--aa-radius-xl", v: "18px" },
  { t: "--aa-radius-2xl", v: "22px" },
  { t: "--aa-radius-full", v: "9999px" },
] as const;

const SHADOWS = [
  { t: "--aa-shadow-sm", l: "Small" },
  { t: "--aa-shadow-md", l: "Medium" },
  { t: "--aa-shadow-lg", l: "Large" },
  { t: "--aa-hero-shadow", l: "Hero" },
] as const;

const EASINGS = [
  { t: "--aa-ease-out", l: "Out" },
  { t: "--aa-ease-out-quart", l: "Out Quart" },
  { t: "--aa-ease-spring", l: "Spring" },
] as const;

const DURATIONS = [
  { t: "--aa-dur-fast", l: "Fast (120ms)" },
  { t: "--aa-dur-base", l: "Base (200ms)" },
  { t: "--aa-dur-slow", l: "Slow (400ms)" },
] as const;

/* ================================================================
   Helpers
   ================================================================ */

function Sec({ id, title, desc, children }: { id: SectionId; title: string; desc?: string; children: ReactNode }) {
  return (
    <section id={id} className="ds-section">
      <h2 className="ds-section__title">{title}</h2>
      {desc && <p className="ds-section__desc">{desc}</p>}
      {children}
    </section>
  );
}

function Sub({ h, children }: { h: string; children: ReactNode }) {
  return (
    <div className="ds-subsection">
      <h3 className="ds-subsection__h">{h}</h3>
      {children}
    </div>
  );
}

function T({ token, value }: { token: string; value: string }) {
  return (
    <span className="ds-token">
      <code className="ds-token__code">{token}</code>
      <span className="ds-token__val">{value}</span>
    </span>
  );
}

/* ================================================================
   Page
   ================================================================ */

export function DesignSystemPage() {
  const [active, setActive] = useState<SectionId>("overview");
  const [lensActive, setLensActive] = useState<"work" | "me">("work");

  return (
    <div className="ds">
      {/* ---- Sidebar nav ---- */}
      <aside className="ds-nav">
        <div className="ds-nav__brand">
          <div className="ds-nav__mark"><BrandMark size="sm" /></div>
          <span className="ds-nav__name">Design System</span>
        </div>
        <nav className="ds-nav__list">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`ds-nav__item ${active === s.id ? "ds-nav__item--active" : ""}`}
              onClick={() => { setActive(s.id); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth" }); }}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* ---- Main content ---- */}
      <main className="ds-main">
        {/* HEADER */}
        <div className="ds-hero">
          <div className="ds-hero__mark"><BrandMark size="lg" /></div>
          <h1 className="ds-hero__title">ActionAmp Design System</h1>
          <p className="ds-hero__sub">
            Things-inspired DNA. Cool-tinted neutrals, teal primary accent, amber human emphasis.
            System fonts, 4/8 spacing grid, OKLCH color space.
          </p>
        </div>

        {/* OVERVIEW */}
        <Sec id="overview" title="Design Principles" desc="Five principles that guide every decision.">
          <div className="ds-principles">
            {[
              { p: "The list is demoted", d: "What Now is the home screen. Not a list — a chooser. Focus on the next action, not everything." },
              { p: "Teal carries 30%", d: "Every surface should feel teal-touched. It's the system color — states, actions, structure. Amber is rare: only for human emphasis." },
              { p: "Cool-tinted calm", d: "All neutrals lean blue. Never pure gray, never pure black, never pure white. The app should feel like Things — calm, confident, quiet." },
              { p: "Native system fonts", d: "SF Pro on Apple, Segoe on Windows, Roboto on Android. No custom font loading. Fast, native, familiar." },
              { p: "Motion with meaning", d: "Spring-based transitions. Every animation answers a question: 'Where did this come from?' 'What happened?'" },
            ].map((x) => (
              <div key={x.p} className="ds-principle">
                <h3 className="ds-principle__title">{x.p}</h3>
                <p className="ds-principle__detail">{x.d}</p>
              </div>
            ))}
          </div>
        </Sec>

        {/* TYPOGRAPHY */}
        <Sec id="typography" title="Typography" desc="System font stack. Matches the type scale used across all prototypes (landing hero, What Now card, triage).">
          <div className="ds-type-scale">
            {FONT_SIZES.map((f) => (
              <div key={f.label} className="ds-type-row">
                <span className="ds-type-row__label">{f.label}</span>
                <span className="ds-type-row__sample" style={f.s as React.CSSProperties}>The quick brown fox</span>
                <code className="ds-type-row__css">{JSON.stringify(f.s)}</code>
              </div>
            ))}
          </div>
          <Sub h="Font Stacks">
            <div className="ds-font-stacks">
              <div className="ds-font-stack"><T token="--aa-font" value="ui-sans-serif, -apple-system, BlinkMacSystemFont, 'SF Pro Text', Roboto, sans-serif" /></div>
              <div className="ds-font-stack"><T token="--aa-font-mono" value="ui-monospace, SFMono-Regular, Menlo, monospace" /></div>
            </div>
          </Sub>
        </Sec>

        {/* COLORS */}
        <Sec id="colors" title="Colors" desc="OKLCH color space. All neutrals cool-tinted (hue 230). Teal primary, amber rare.">
          {COLOR_GROUPS.map((g) => (
            <div key={g.name} className="ds-color-group">
              <h3 className="ds-color-group__name">{g.name}</h3>
              <div className="ds-color-grid">
                {g.tokens.map((t) => (
                  <div key={t.v} className="ds-swatch">
                    <div className="ds-swatch__box" style={{ background: `var(${t.v})` }} />
                    <div className="ds-swatch__info">
                      <span className="ds-swatch__label">{t.label}</span>
                      <code className="ds-swatch__code">{t.v}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Sec>

        {/* SPACING & RADIUS */}
        <Sec id="spacing" title="Spacing & Radius" desc="4px base unit. 4/8 grid. Radii from subtle (4px) to full (pill).">
          <Sub h="Spacing Scale">
            <div className="ds-spacing-grid">
              {SPACING.map((s) => (
                <div key={s.t} className="ds-spacing-item">
                  <div className="ds-spacing-item__bar" style={{ width: `var(${s.t})` }} />
                  <code className="ds-spacing-item__code">{s.t}</code>
                  <span className="ds-spacing-item__val">{s.v}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub h="Border Radius">
            <div className="ds-radius-grid">
              {RADII.map((r) => (
                <div key={r.t} className="ds-radius-item">
                  <div className="ds-radius-item__box" style={{ borderRadius: `var(${r.t})` }} />
                  <code className="ds-radius-item__code">{r.t}</code>
                  <span className="ds-radius-item__val">{r.v}</span>
                </div>
              ))}
            </div>
          </Sub>
        </Sec>

        {/* BUTTONS */}
        <Sec id="buttons" title="Buttons" desc="Four variants. Three sizes. Icon + kbd hint support. From app-shell + landing + triage prototypes.">
          <Sub h="Variants">
            <div className="ds-btn-row">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </Sub>
          <Sub h="Sizes">
            <div className="ds-btn-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </Sub>
          <Sub h="With Icon + Kbd">
            <div className="ds-btn-row">
              <Button icon={<BrandMark size="sm" />}>Capture</Button>
              <Button variant="ghost" kbd="⌘K">Quick Add</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </div>
          </Sub>
          <Sub h="Usage">
            <div className="ds-usage">
              <p className="ds-usage__p"><strong>Primary</strong> — main CTAs: "Do this", "Save", "Upgrade", "Start triage".</p>
              <p className="ds-usage__p"><strong>Secondary</strong> — supporting actions: "Not now", "Manage billing", "Cancel".</p>
              <p className="ds-usage__p"><strong>Ghost</strong> — minimal actions: "Skip", nav items, toolbar buttons.</p>
              <p className="ds-usage__p"><strong>Danger</strong> — destructive: "Delete account", "Remove project".</p>
            </div>
          </Sub>
        </Sec>

        {/* CARDS */}
        <Sec id="cards" title="Cards" desc="Surface card with elevation and interactivity options.">
          <Sub h="Variants">
            <div className="ds-card-row">
              <Card variant="default"><p style={{ margin: 0, color: "var(--aa-text-2)" }}>Default — subtle border, flat surface.</p></Card>
              <Card variant="elevated"><p style={{ margin: 0, color: "var(--aa-text-2)" }}>Elevated — no border, medium shadow.</p></Card>
              <Card variant="interactive"><p style={{ margin: 0, color: "var(--aa-text-2)" }}>Interactive — hover lift effect.</p></Card>
              <Card variant="highlighted"><p style={{ margin: 0, color: "var(--aa-text-2)" }}>Highlighted — teal border + glow.</p></Card>
            </div>
          </Sub>
        </Sec>

        {/* CHIPS */}
        <Sec id="chips" title="Chips & Badges" desc="Inline pills for tags, dates, priorities, status. From triage prototype chip taxonomy.">
          <Sub h="Chip Variants">
            <div className="ds-chip-row">
              <Chip variant="default">Default</Chip>
              <Chip variant="teal">📅 Tomorrow</Chip>
              <Chip variant="teal">Today</Chip>
              <Chip variant="amber">★ Important</Chip>
              <Chip variant="violet">#work</Chip>
              <Chip variant="rose">Overdue</Chip>
              <Chip variant="muted">Someday</Chip>
            </div>
          </Sub>
          <Sub h="In Context (task row)">
            <div className="ds-chip-context">
              <p style={{ margin: 0, color: "var(--aa-text-2)" }}>
                Email Sarah re: Q3 invoice
                <span style={{ display: "inline-flex", gap: "4px", marginLeft: "8px" }}>
                  <Chip variant="teal">📅 Tomorrow</Chip>
                  <Chip variant="amber">★ Important</Chip>
                </span>
              </p>
            </div>
          </Sub>
          <Sub h="Methodology Badges (landing)">
            <div className="ds-chip-row">
              {["Inbox → triage", "Goals over areas", "Projects & tasks", "Priority + size"].map((b) => (
                <span key={b} className="ds-badge">
                  <span className="ds-badge__slash">/</span>
                  {b}
                </span>
              ))}
            </div>
          </Sub>
        </Sec>

        {/* COMPLETION CIRCLE */}
        <Sec id="completion" title="Completion Circle" desc="The signature empty→filled interaction. Used in What Now, Today, and landing hero.">
          <Sub h="States">
            <div className="ds-cc-row">
              <div className="ds-cc-demo"><CompletionCircle size="sm" /><span className="ds-cc-demo__label">Empty (sm)</span></div>
              <div className="ds-cc-demo"><CompletionCircle size="sm" filled /><span className="ds-cc-demo__label">Filled (sm)</span></div>
              <div className="ds-cc-demo"><CompletionCircle size="md" /><span className="ds-cc-demo__label">Empty (md)</span></div>
              <div className="ds-cc-demo"><CompletionCircle size="md" filled /><span className="ds-cc-demo__label">Filled (md)</span></div>
            </div>
          </Sub>
          <Sub h="Interactive Demo">
            <InteractiveCCDemo />
          </Sub>
        </Sec>

        {/* FORMS */}
        <Sec id="forms" title="Form Elements" desc="Input, select, textarea — styled via design tokens.">
          <Sub h="Text Input">
            <div className="ds-form-row">
              <input className="ds-input" type="text" placeholder="Default input" />
              <input className="ds-input" type="email" placeholder="Email address" />
              <input className="ds-input ds-input--error" type="text" placeholder="Error state" />
            </div>
          </Sub>
          <Sub h="Select">
            <div className="ds-form-row">
              <select className="ds-select"><option>Default select</option><option>Option B</option></select>
            </div>
          </Sub>
          <Sub h="Textarea">
            <div className="ds-form-row">
              <textarea className="ds-textarea" placeholder="Notes…" rows={3} />
            </div>
          </Sub>
        </Sec>

        {/* SHADOWS & MOTION */}
        <Sec id="shadows" title="Shadows & Motion" desc="Blue-tinted layered shadows. Spring-based easing.">
          <Sub h="Shadows">
            <div className="ds-shadow-grid">
              {SHADOWS.map((s) => (
                <div key={s.t} className="ds-shadow-item">
                  <div className="ds-shadow-item__box" style={{ boxShadow: `var(${s.t})` }} />
                  <code className="ds-shadow-item__code">{s.t}</code>
                  <span className="ds-shadow-item__label">{s.l}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub h="Easing Curves">
            <div className="ds-easing-grid">
              {EASINGS.map((e) => (
                <div key={e.t} className="ds-easing-item">
                  <code className="ds-easing-item__code">{e.t}</code>
                  <span className="ds-easing-item__label">{e.l}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub h="Durations">
            <div className="ds-duration-grid">
              {DURATIONS.map((d) => (
                <div key={d.t} className="ds-duration-item">
                  <code className="ds-duration-item__code">{d.t}</code>
                  <span className="ds-duration-item__label">{d.l}</span>
                </div>
              ))}
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           SIDEBAR (from app-shell-whatnow.html prototype)
           ============================================================ */}
        <Sec id="sidebar" title="Sidebar" desc="The app shell sidebar — lens switch, nav items with icons + active bar + count badges. From app-shell-whatnow.html.">
          <Sub h="Lens Switch (Work / Me)">
            <div className="ds-lens">
              <button className={`ds-lens__btn ${lensActive === "work" ? "ds-lens__btn--active" : ""}`} onClick={() => setLensActive("work")}>Work</button>
              <button className={`ds-lens__btn ${lensActive === "me" ? "ds-lens__btn--active" : ""}`} onClick={() => setLensActive("me")}>Me</button>
            </div>
          </Sub>
          <Sub h="Nav Items">
            <div className="ds-navitems">
              {/* What Now — active */}
              <a className="ds-navitem ds-navitem--active">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.8 4.2 4.5.4-3.4 3 1 4.4L8 11.3 4.1 13.5l1-4.4-3.4-3 4.5-.4z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                What Now
              </a>
              {/* Inbox — with urgent count */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Inbox
                <span className="ds-navitem__count ds-navitem__count--urgent">4</span>
              </a>
              {/* Today — with count */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                Today
                <span className="ds-navitem__count">3</span>
              </a>
              {/* Upcoming */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                Upcoming
              </a>
              {/* Someday */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 8c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5-2.5 5.5-5.5 5.5-5.5-2.5-5.5-5.5z" stroke="currentColor" strokeWidth="1.4" /><path d="M8 5v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1 1.5" /></svg>
                Someday
              </a>
              {/* Projects — with count */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h3l1.5 8h6L14 6H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="13.5" r="1" fill="currentColor" /><circle cx="11.5" cy="13.5" r="1" fill="currentColor" /></svg>
                Projects
                <span className="ds-navitem__count">6</span>
              </a>
              {/* Goals — with count */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1l2.2 4.5 5 .7-3.6 3.5.85 5L8 12.3 3.55 14.7l.85-5L.8 6.2l5-.7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg>
                Goals
                <span className="ds-navitem__count">3</span>
              </a>
              {/* Logbook */}
              <a className="ds-navitem">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13.5V4l4-1.5v11M6 8h4M10 13.5V6l4-1.5v9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Logbook
              </a>
            </div>
          </Sub>
          <Sub h="User Footer">
            <div className="ds-navitem ds-navitem--user">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              Jake
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           LENS SWITCH — Work/Me toggle
           ============================================================ */}
        <Sec id="lens" title="Lens Switch" desc="Segmented control for switching between life contexts (Work / Me). Sits at the top of the sidebar. Distinct from ModeDial (operational modes). From app-shell-whatnow.html.">
          <Sub h="Default">
            <LensSwitchDemo />
          </Sub>
        </Sec>

        {/* ============================================================
           NAV ITEM — sidebar nav element
           ============================================================ */}
        <Sec id="nav-item" title="Nav Item" desc="Sidebar navigation item with icon, optional count badge, and the signature teal left-edge active bar. From app-shell-whatnow.html.">
          <Sub h="States">
            <div className="ds-navitems">
              <NavItem icon={<StarIcon />} label="What Now" active />
              <NavItem icon={<InboxIcon />} label="Inbox" count={4} countVariant="urgent" />
              <NavItem icon={<ClockIcon />} label="Today" count={3} />
              <NavItem icon={<ProjectsIcon />} label="Projects" soon />
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           ICON SET — nav + UI icons
           ============================================================ */}
        <Sec id="icons" title="Icon Set" desc="Thin 1.4-stroke SVG icons, 16×16 viewBox. All use currentColor for theming. Source: app-shell-whatnow.html.">
          <Sub h="Navigation">
            <div className="ds-icon-grid">
              {[
                { icon: <StarIcon />, label: "Star" },
                { icon: <InboxIcon />, label: "Inbox" },
                { icon: <ClockIcon />, label: "Clock" },
                { icon: <CalendarIcon />, label: "Calendar" },
                { icon: <SomedayIcon />, label: "Someday" },
                { icon: <ProjectsIcon />, label: "Projects" },
                { icon: <GoalsIcon />, label: "Goals" },
                { icon: <LogbookIcon />, label: "Logbook" },
              ].map((i) => (
                <div key={i.label} className="ds-icon-item">
                  <span className="ds-icon-item__svg">{i.icon}</span>
                  <span className="ds-icon-item__label">{i.label}</span>
                </div>
              ))}
            </div>
          </Sub>
          <Sub h="Actions">
            <div className="ds-icon-grid">
              {[
                { icon: <PlusIcon />, label: "Plus" },
                { icon: <MoonIcon />, label: "Moon" },
                { icon: <SunIcon />, label: "Sun" },
                { icon: <UserIcon />, label: "User" },
              ].map((i) => (
                <div key={i.label} className="ds-icon-item">
                  <span className="ds-icon-item__svg">{i.icon}</span>
                  <span className="ds-icon-item__label">{i.label}</span>
                </div>
              ))}
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           TOPBAR & KBD (from app-shell-whatnow.html)
           ============================================================ */}
        <Sec id="topbar" title="Topbar & Kbd" desc="Top-right action bar from app shell. Kbd button for ⌘K capture, icon button for theme toggle.">
          <Sub h="Kbd Button (⌘K Capture)">
            <div className="ds-btn-row">
              <button className="ds-kbd-btn">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                Capture
                <span className="ds-kbd-btn__kbd">⌘K</span>
              </button>
            </div>
          </Sub>
          <Sub h="Icon Button (Theme Toggle)">
            <div className="ds-btn-row">
              <button className="ds-icon-btn" title="Toggle theme (⌘D)">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M13 9.2A5 5 0 016.8 3 5.5 5.5 0 1013 9.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              </button>
              <button className="ds-icon-btn" title="Close">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           DISPATCH BUTTONS (from triage-tinder.html)
           ============================================================ */}
        <Sec id="dispatch" title="Dispatch Buttons" desc="Triage action buttons — icon + label + sublabel + kbd shortcut. From triage-tinder.html prototype.">
          <Sub h="Primary Dispatch">
            <div className="ds-dispatch-grid">
              <button className="ds-disp-btn">
                <div className="ds-disp-btn__icon ds-disp-btn__icon--teal">
                  <svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v3.5l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
                <div className="ds-disp-btn__text">
                  <div className="ds-disp-btn__label">Task · Today</div>
                  <div className="ds-disp-btn__sub">a quick action, due today</div>
                </div>
                <span className="ds-disp-btn__key">1</span>
              </button>
              <button className="ds-disp-btn">
                <div className="ds-disp-btn__icon ds-disp-btn__icon--violet">
                  <svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M2 6h12" stroke="currentColor" strokeWidth="1.5" /></svg>
                </div>
                <div className="ds-disp-btn__text">
                  <div className="ds-disp-btn__label">Project</div>
                  <div className="ds-disp-btn__sub">a big outcome, multi-step</div>
                </div>
                <span className="ds-disp-btn__key">P</span>
              </button>
              <button className="ds-disp-btn ds-disp-btn--full">
                <div className="ds-disp-btn__icon ds-disp-btn__icon--amber">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 13.5V3.5a1 1 0 011-1h5.5L13 5.5v8a1 1 0 01-1 1H4.5a1 1 0 01-1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M9.5 2.5V6h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
                </div>
                <div className="ds-disp-btn__text">
                  <div className="ds-disp-btn__label">Resource</div>
                  <div className="ds-disp-btn__sub">reference — link or note, filed under a project or goal</div>
                </div>
                <span className="ds-disp-btn__key">R</span>
              </button>
            </div>
          </Sub>
          <Sub h="Secondary Dispatch (Mini)">
            <div className="ds-dispatch-mini-row">
              <button className="ds-disp-mini">Upcoming<span className="ds-disp-mini__key">2</span></button>
              <button className="ds-disp-mini">Someday<span className="ds-disp-mini__key">3</span></button>
              <button className="ds-disp-mini ds-disp-mini--danger">Trash<span className="ds-disp-mini__key">Del</span></button>
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           PROGRESS BAR (from triage-tinder.html)
           ============================================================ */}
        <Sec id="progress" title="Progress Bar" desc="Triage progress indicator — count text + fill bar. From triage-tinder.html.">
          <Sub h="States">
            <div className="ds-progress-row">
              <div className="ds-progress-item">
                <span className="ds-progress__count"><b>1</b> of <b>7</b></span>
                <div className="ds-progress__bar"><div className="ds-progress__fill" style={{ width: "14%" }} /></div>
              </div>
              <div className="ds-progress-item">
                <span className="ds-progress__count"><b>4</b> of <b>7</b></span>
                <div className="ds-progress__bar"><div className="ds-progress__fill" style={{ width: "57%" }} /></div>
              </div>
              <div className="ds-progress-item">
                <span className="ds-progress__count"><b>7</b> of <b>7</b> · done</span>
                <div className="ds-progress__bar"><div className="ds-progress__fill" style={{ width: "100%" }} /></div>
              </div>
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           EMPTY STATES (from triage-tinder.html)
           ============================================================ */}
        <Sec id="empty" title="Empty States" desc="Inbox zero. What Now empty. From triage-tinder + What Now prototypes.">
          <Sub h="Inbox Zero (Triage Complete)">
            <div className="ds-empty-state">
              <div className="ds-empty-state__circle">
                <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <h3 className="ds-empty-state__title">Inbox zero.</h3>
              <p className="ds-empty-state__text">Nothing left to decide. Go do something.</p>
            </div>
          </Sub>
          <Sub h="What Now Empty">
            <div className="ds-empty-state">
              <h3 className="ds-empty-state__title" style={{ fontSize: "2rem" }}>What now?</h3>
              <p className="ds-empty-state__text">Your inbox is empty. Capture something with <span className="ds-inline-kbd">⌘K</span></p>
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           WHAT NOW CARD (composite from all 3 prototypes)
           ============================================================ */}
        <Sec id="wn-card" title="What Now Card" desc="The composite task card — context pill, completion circle, task, meta, why badge, actions. From app-shell + landing + triage prototypes.">
          <Sub h="Full Card (App Shell Version)">
            <WhatNowCardDemo />
          </Sub>
          <Sub h="Landing Hero Card Version">
            <div className="ds-wn-hero-card">
              <div className="ds-wn-ctx">
                <span className="ds-wn-ctx__dot" />
                Right now · 30 min
              </div>
              <div className="ds-wn-completion-wrap">
                <CompletionCircle size="md" />
              </div>
              <div className="ds-wn-title">Email Sarah re: Q3 invoice</div>
              <div className="ds-wn-meta">Due today · 15 min</div>
              <div className="ds-wn-why">★ Important · the reason this is next</div>
              <div className="ds-wn-actions">
                <Button size="sm">Do this</Button>
                <Button variant="secondary" size="sm">Switch</Button>
              </div>
            </div>
          </Sub>
        </Sec>

        {/* ============================================================
           MODE DIAL (bottom nav) — foundation of navigation
           ============================================================ */}
        <Sec id="mode-dial" title="Mode Dial — Bottom Nav" desc="The foundation of navigation. Bottom-center persistent pill holding mode switchers (Plan / Do / Review). Active mode gets teal. From mode-zoom-unified + approach-c-time-adaptive + mobile-gesture-modal.">
          <Sub h="Default (Desktop)">
            <ModeDialDemo variant="default" />
          </Sub>
          <Sub h="Compact (Mobile Thumb Zone)">
            <ModeDialDemo variant="compact" />
          </Sub>
          <Sub h="In Bottom Cluster (Dial + Zoom + Capture)">
            <BottomClusterDemo />
          </Sub>
        </Sec>

        {/* ============================================================
           ZOOM DOCK — Task/Project/Goal zoom controls
           ============================================================ */}
        <Sec id="zoom-dock" title="Zoom Dock" desc="Task / Project / Goal zoom controls. Icon-only pill docked beside the ModeDial. Active level gets teal. From mode-zoom-unified + approach-a-zoom-pan.">
          <Sub h="Default">
            <ZoomDockDemo />
          </Sub>
        </Sec>

        {/* ============================================================
           BREADCRUMB — zoom orientation
           ============================================================ */}
        <Sec id="breadcrumb" title="Breadcrumb" desc="Zoom orientation crumbs (Goal › Project › Task). Current scope highlighted teal; ancestors dim. From mode-zoom-unified + mobile-gesture-modal + approach-a-zoom-pan.">
          <Sub h="Default">
            <BreadcrumbDemo />
          </Sub>
        </Sec>

        {/* ============================================================
           OVERLAYS & MODALS — the app's overlay approach
           ============================================================ */}
        <Sec id="overlays" title="Overlays & Modals" desc="The app uses four overlay patterns. Each has a specific use — don't mix them. See docs/modal-approach.md for the full spec.">
          <div className="ds-overlay-grid">
            <div className="ds-overlay-card">
              <div className="ds-overlay-card__num">01</div>
              <h3 className="ds-overlay-card__title">Full-screen overlay</h3>
              <p className="ds-overlay-card__use"><strong>Use:</strong> immersive flows that take over the whole screen</p>
              <p className="ds-overlay-card__ex">Triage · Focus mode · Onboarding coach</p>
              <div className="ds-overlay-preview ds-overlay-preview--full">
                <span className="ds-overlay-preview__label">Full viewport</span>
              </div>
            </div>
            <div className="ds-overlay-card">
              <div className="ds-overlay-card__num">02</div>
              <h3 className="ds-overlay-card__title">Capture popover</h3>
              <p className="ds-overlay-card__use"><strong>Use:</strong> quick input, dismissable, never blocks flow</p>
              <p className="ds-overlay-card__ex">⌘K capture · quick add · inline edit</p>
              <div className="ds-overlay-preview ds-overlay-preview--pop">
                <span className="ds-overlay-preview__label">Centered card</span>
              </div>
            </div>
            <div className="ds-overlay-card">
              <div className="ds-overlay-card__num">03</div>
              <h3 className="ds-overlay-card__title">Bottom sheet</h3>
              <p className="ds-overlay-card__use"><strong>Use:</strong> mobile-first actions anchored to thumb zone</p>
              <p className="ds-overlay-card__ex">Snooze options · action menus · "Not now" flow</p>
              <div className="ds-overlay-preview ds-overlay-preview--sheet">
                <span className="ds-overlay-preview__label">Anchored bottom</span>
              </div>
            </div>
            <div className="ds-overlay-card">
              <div className="ds-overlay-card__num">04</div>
              <h3 className="ds-overlay-card__title">Confirm dialog</h3>
              <p className="ds-overlay-card__use"><strong>Use:</strong> destructive or irreversible actions (rare)</p>
              <p className="ds-overlay-card__ex">Delete account · Discard changes</p>
              <div className="ds-overlay-preview ds-overlay-preview--confirm">
                <span className="ds-overlay-preview__label">Small centered</span>
              </div>
            </div>
          </div>
          <Sub h="Shared behaviors">
            <div className="ds-usage">
              <p className="ds-usage__p"><strong>Backdrop:</strong> semi-transparent surface tint, <code className="ds-inline-code">oklch(0.2 0.02 230 / 0.4)</code>. Click dismisses non-blocking overlays only.</p>
              <p className="ds-usage__p"><strong>Escape:</strong> every overlay closes on <span className="ds-inline-kbd">Esc</span>. Never trap the user.</p>
              <p className="ds-usage__p"><strong>Focus:</strong> focus moves into the overlay on open, returns to trigger on close. Trap focus inside while open.</p>
              <p className="ds-usage__p"><strong>Scroll lock:</strong> body scroll locks while any overlay is open.</p>
              <p className="ds-usage__p"><strong>Motion:</strong> backdrop fades 150ms; content rises 250ms with <code className="ds-inline-code">--aa-ease-out-quart</code>. Exit is ~60% of enter duration.</p>
            </div>
          </Sub>
        </Sec>
      </main>
    </div>
  );
}

/* ================================================================
   Interactive demo — click to toggle completion circle
   ================================================================ */

function InteractiveCCDemo() {
  const [filled, setFilled] = useState(false);
  const [burst, setBurst] = useState(false);
  const handleClick = () => {
    if (!filled) {
      setFilled(true);
      setBurst(true);
      setTimeout(() => setBurst(false), 600);
      setTimeout(() => setFilled(false), 2000);
    }
  };
  return (
    <div className="ds-cc-demo ds-cc-demo--hero">
      <CompletionCircle size="md" filled={filled} onClick={handleClick} className={burst ? "aa-cc--burst" : ""} />
      <span className="ds-cc-demo__label">Click to complete (auto-resets)</span>
    </div>
  );
}

/* ================================================================
   What Now card interactive demo
   ================================================================ */

function WhatNowCardDemo() {
  return (
    <WhatNowCard
      task={{
        title: "Email Sarah re: Q3 invoice",
        project: "Ship product v2",
        due: "due today",
        size: "15 min",
        why: "Because it's",
        whyEmphasis: "Important and due today.",
      }}
      context="Right now · 30 min available · Work"
    />
  );
}

/* ================================================================
   ModeDial demo
   ================================================================ */

const MODE_ITEMS = [
  { id: "plan", label: "Plan", icon: <span>☀</span> },
  { id: "do", label: "Do", icon: <span>▶</span> },
  { id: "review", label: "Review", icon: <span>☾</span> },
];

function ModeDialDemo({ variant }: { variant: "default" | "compact" }) {
  const [mode, setMode] = useState("do");
  return (
    <ModeDial
      items={MODE_ITEMS}
      active={mode}
      onSelect={setMode}
      variant={variant}
    />
  );
}

/* ================================================================
   Bottom cluster demo — Dial + ZoomDock + Capture FAB
   ================================================================ */

function BottomClusterDemo() {
  const [mode, setMode] = useState("do");
  const [zoom, setZoom] = useState("task");
  return (
    <div className="ds-bottom-cluster">
      <ModeDial items={MODE_ITEMS} active={mode} onSelect={setMode} />
      <ZoomDock
        items={[
          {
            id: "goal",
            label: "Goal (Z)",
            icon: (
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              </svg>
            ),
          },
          {
            id: "project",
            label: "Project",
            icon: (
              <svg viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            ),
          },
          {
            id: "task",
            label: "Task (X)",
            icon: (
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="2.5" fill="currentColor" />
              </svg>
            ),
          },
        ]}
        active={zoom}
        onSelect={setZoom}
      />
      <Button variant="primary" icon={<span style={{ fontSize: "1rem", lineHeight: 1 }}>+</span>} kbd="⌘K" bare>
        <span className="ds-fab-label">Capture</span>
      </Button>
    </div>
  );
}

/* ================================================================
   ZoomDock demo
   ================================================================ */

function ZoomDockDemo() {
  const [zoom, setZoom] = useState("task");
  return (
    <ZoomDock
      items={[
        {
          id: "goal",
          label: "Goal (Z)",
          icon: (
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="8" r="1.5" fill="currentColor" />
            </svg>
          ),
        },
        {
          id: "project",
          label: "Project",
          icon: (
            <svg viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ),
        },
        {
          id: "task",
          label: "Task (X)",
          icon: (
            <svg viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2.5" fill="currentColor" />
            </svg>
          ),
        },
      ]}
      active={zoom}
      onSelect={setZoom}
    />
  );
}

/* ================================================================
   Breadcrumb demo
   ================================================================ */

function BreadcrumbDemo() {
  const [active, setActive] = useState("task");
  return (
    <Breadcrumb
      items={[
        { id: "goal", label: "Grow audience" },
        { id: "project", label: "Ship product v2" },
        { id: "task", label: "Email Sarah" },
      ]}
      active={active}
      onSelect={setActive}
    />
  );
}

/* ================================================================
   LensSwitch demo
   ================================================================ */

function LensSwitchDemo() {
  const [lens, setLens] = useState("work");
  return (
    <div style={{ width: 200 }}>
      <LensSwitch
        options={[
          { id: "work", label: "Work" },
          { id: "me", label: "Me" },
        ]}
        active={lens}
        onSelect={setLens}
      />
    </div>
  );
}
