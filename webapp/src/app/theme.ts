export type AppTheme = "light" | "dark";

export function preferredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("aa-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
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
