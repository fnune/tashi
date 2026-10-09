import type { Settings } from "@pincho/shared";
import { findMealWindow } from "@pincho/shared";
import { Link } from "react-router";
import type { Language } from "../i18n.js";
import { t } from "../i18n.js";
import { Logo } from "./Logo.js";
import "./AppHeader.css";

export function AppHeader({
  settings,
  lang,
}: {
  settings: Settings;
  lang: Language;
}) {
  const window = findMealWindow(settings);
  const ratio = window
    ? new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(
        window.ratio,
      )
    : null;

  return (
    <header className="app-header">
      <h1>
        <Link to="/" className="app-brand">
          <Logo className="app-logo" />
          {t(lang, "appTitle")}
        </Link>
      </h1>
      {window && (
        <span className="meal-window-chip">
          {window.name} · <b>{ratio} g/U</b>
        </span>
      )}
    </header>
  );
}
