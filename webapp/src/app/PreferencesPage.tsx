import { useState } from "react";
import { SettingsLayout } from "./SettingsLayout";
import { Field } from "./Field";
import { Chip } from "../components/ui";
import "./Field.css";
import "./PreferencesPage.css";

/**
 * Preferences — app behavior. Theme toggle is live (wired to [data-theme] +
 * localStorage); the rest are stubbed with "soon" chips until their features
 * ship, per the honesty-over-fake-toggles principle.
 */

const TODAY_CAP_DEFAULT = 5;

export function PreferencesPage() {
  // ---- Theme: live, persisted ----
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem("aa-theme") as "light" | "dark" | null;
    if (stored) return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const toggleTheme = (next: boolean) => {
    const value = next ? "dark" : "light";
    setTheme(value);
    localStorage.setItem("aa-theme", value);
    document.documentElement.dataset.theme = value;
  };

  // The rest are not yet wired (their features ship later).
  return (
    <SettingsLayout>
      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Appearance</h2>
        <Field
          label="Dark mode"
          description="Switch the app to a dark theme. Respects your system setting on first visit."
          toggle={{ checked: theme === "dark", onChange: toggleTheme }}
        />
      </section>

      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Today</h2>
        <Field
          label="Today cap"
          description={`Limit Today to ${TODAY_CAP_DEFAULT} items. Forces the "what actually matters" decision.`}
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
      </section>

      <section className="aa-settings-section">
        <h2 className="aa-settings-sh">Feedback</h2>
        <Field
          label="Completion sounds"
          description="A soft sound when you complete a task. Off by default."
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
        <Field
          label="Momentum"
          description="A light 'X done today' counter. No badges, no guilt trips."
        >
          <Chip variant="muted" small>soon</Chip>
        </Field>
      </section>
    </SettingsLayout>
  );
}
