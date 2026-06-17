import { SettingsLayout } from "./SettingsLayout";

/**
 * Preferences — app behavior (theme, Today cap, sounds). Stub for now; these
 * settings arrive with their features (F12, F17, F24). Honesty over fake
 * toggles, per PRODUCT.md.
 */
const PREFERENCES = [
  { id: "theme", label: "Theme", desc: "Dark by default.", soon: true },
  { id: "today-cap", label: "Today cap", desc: "Max 5 items (configurable, or off).", soon: true },
  { id: "sounds", label: "Completion sounds", desc: "Off by default.", soon: true },
  { id: "momentum", label: "Momentum", desc: "Light counter — off by default.", soon: true },
];

export function PreferencesPage() {
  return (
    <SettingsLayout>
      {PREFERENCES.map((pref) => (
        <section className="aa-settings-section aa-settings-soon" key={pref.id}>
          <div className="aa-pref-row">
            <div>
              <h2 className="aa-settings-sh">
                {pref.label} <em>soon</em>
              </h2>
              <p className="aa-settings-note">{pref.desc}</p>
            </div>
          </div>
        </section>
      ))}
    </SettingsLayout>
  );
}
