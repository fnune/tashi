import type { Settings } from "@pincho/shared";
import { activeProfile, findMealWindow, windowRatio } from "@pincho/shared";
import { Link } from "react-router";
import type { Language } from "../i18n.js";
import { t } from "../i18n.js";
import {
  profileIcon,
  profileName,
  profileRaisesDose,
} from "../profileLabels.js";
import { formatRatio, formatRatioNumber } from "../ratioLabels.js";
import { Logo } from "./Logo.js";
import { Icon } from "./ui/Icon.js";
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
  const modified = ratio?.modifier && ratio.modifier.kind !== "none";
  const icon = modified ? profileIcon(profile) : null;

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
          className="ratio-pill"
          aria-label={t(lang, "activeRatioLabel")
            .replace("{meal}", window.name)
            .replace(
              "{ratio}",
              formatRatio(ratio.result, settings.ratio_format, lang),
            )
            .replace("{profile}", profileName(profile, lang))}
        >
          {icon && (
            <span
              className="ratio-pill-icon"
              data-raises={profileRaisesDose(profile) || undefined}
            >
              <Icon name={icon} size="sm" />
            </span>
          )}
          <span className="ratio-pill-meal">{window.name}</span>
          {modified && (
            <span className="ratio-pill-base num">
              {formatRatioNumber(ratio.base, settings.ratio_format, lang)} →
            </span>
          )}
          <b className="num">
            {formatRatio(ratio.result, settings.ratio_format, lang)}
          </b>
        </Link>
      )}
    </header>
  );
}
