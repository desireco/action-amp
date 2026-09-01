export function initialTheme(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

export function toggleTheme(): boolean {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem("lg-theme", dark ? "dark" : "light");
  } catch {}
  return dark;
}
