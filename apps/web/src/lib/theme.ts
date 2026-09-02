/**
 * Theme — ported from webapp/src/app/theme.ts (S11 Preferences). Client-only:
 * the toggle writes `[data-theme]` + localStorage["aa-theme"]; no server op.
 * First visit follows `prefers-color-scheme`; corrupt stored values fall back.
 */
export type AppTheme = "light" | "dark";

export function preferredTheme(): AppTheme {
  const browserWindow = globalThis.window;
  if (!browserWindow) return "light";
  const stored = browserWindow.localStorage.getItem("aa-theme");
  if (stored === "light" || stored === "dark") return stored;
  return browserWindow.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: AppTheme): AppTheme {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("aa-theme", theme);
  return theme;
}
