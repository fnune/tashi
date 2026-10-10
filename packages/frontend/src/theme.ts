export type ThemePreference = "system" | "light" | "dark";

// Keep in sync with the inline script in index.html, which applies it before first paint.
const STORAGE_KEY = "tashi-theme";

const THEME_COLOR = { light: "#ffffff", dark: "#000000" };

export function savedTheme(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )) {
    const media = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLOR[theme === "system" ? media : theme];
  }
}

export function saveTheme(theme: ThemePreference) {
  try {
    if (theme === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Without storage the choice still applies until the page reloads.
  }
  applyTheme(theme);
}
