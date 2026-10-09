import type { CyclePhase, CycleStatus } from "@pincho/shared";
import { Link } from "react-router";
import { type Language, t } from "../i18n.js";
import { Icon } from "./ui/Icon.js";
import "./CycleBanner.css";

const MOONS: Record<CyclePhase, string> = {
  period: "🌑",
  follicular: "🌒",
  ovulation: "🌕",
  luteal: "🌘",
};

export function CycleBanner({
  status,
  lang,
  onSuggestProfile,
}: {
  status: CycleStatus;
  lang: Language;
  onSuggestProfile: () => void;
}) {
  const summary = (
    <span className="cycle-banner-summary">
      <span aria-hidden="true">{MOONS[status.phase]}</span>
      {t(lang, "cycleDayOf")
        .replace("{day}", String(status.day))
        .replace("{length}", String(status.length))}
      {" · "}
      {t(lang, `phase_${status.phase}`)}
    </span>
  );

  if (status.phaseStartsToday) {
    return (
      <div className="cycle-banner cycle-banner-suggest">
        {summary}
        <button type="button" onClick={onSuggestProfile}>
          {t(lang, "switchProfile")}
        </button>
      </div>
    );
  }
  return (
    <Link to="/settings#cycle" className="cycle-banner">
      {summary}
      <Icon name="chevron" size="sm" />
    </Link>
  );
}
