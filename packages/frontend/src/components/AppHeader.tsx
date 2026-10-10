import type { Settings } from "@pincho/shared";
import { activeProfile, findMealWindow, windowRatio } from "@pincho/shared";
import { Link } from "react-router";
import type { Language } from "../i18n.js";
import { t } from "../i18n.js";
import { formatRatio, formatRatioNumber } from "../ratioLabels.js";
import { Logo } from "./Logo.js";
import "./AppHeader.css";

export const RATIOS_ANCHOR = "ratios";

export function AppHeader({
  settings,
  lang,
}: {
  settings: Settings;
  lang: Language;
}) {
  const window = findMealWindow(settings);
  const profile = activeProfile(settings);
  const ratio = window ? windowRatio(profile, window) : null;
  const modifier = ratio?.modifier;

  return (
    <header className="app-header">
      <h1>
        <Link to="/" className="app-brand">
          <Logo className="app-logo" />
          {t(lang, "appTitle")}
        </Link>
      </h1>
      {window && ratio && (
        <Link
          to={`/settings#${RATIOS_ANCHOR}`}
          className="meal-window-chip"
          data-modified={modifier?.kind !== "none" || undefined}
        >
          {modifier?.kind !== "none" && (
            <span className="meal-window-profile" aria-hidden="true">
              {profile.emoji}
            </span>
          )}
          <span className="meal-window-name">{window.name}</span>
          {modifier?.kind !== "none" && (
            <span className="meal-window-base">
              {formatRatioNumber(ratio.base, settings.ratio_format, lang)} →
            </span>
          )}
          <b>{formatRatio(ratio.result, settings.ratio_format, lang)}</b>
        </Link>
      )}
    </header>
  );
}
