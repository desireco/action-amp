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

export function toggleTheme(): AppTheme {
  return applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );
}
