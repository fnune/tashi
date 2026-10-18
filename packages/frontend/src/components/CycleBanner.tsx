import type { CycleStatus } from "@tashi/shared";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { type Language, t } from "../i18n.js";
import { CycleStrips } from "./CycleStrips.js";
import { Icon } from "./ui/Icon.js";
import "./CycleBanner.css";

export const CYCLE_CHART_ANCHOR = "cycle-chart";

export function CycleBanner({
  status,
  lang,
  onSuggestProfile,
  onConfirmPeriod,
}: {
  status: CycleStatus;
  lang: Language;
  onSuggestProfile: () => void;
  onConfirmPeriod: () => void;
}) {
  const summary = (
    <span className="cycle-banner-summary">
      <span
        className="cycle-banner-dot"
        data-phase={status.phase}
        aria-hidden="true"
      />
      {t(lang, "cycleDayOf")
        .replace("{day}", String(status.day))
        .replace("{length}", String(status.length))}
      {" · "}
      {t(lang, `phase_${status.phase}`)}
    </span>
  );
  const strips = (
    <CycleStrips
      length={status.length}
      currentPhase={status.phase}
      today={status.day}
      compact
      labels={{
        period: t(lang, "phaseShort_period"),
        follicular: t(lang, "phaseShort_follicular"),
        ovulation: t(lang, "phaseShort_ovulation"),
        luteal: t(lang, "phaseShort_luteal"),
      }}
    />
  );
  const suggestion = (text: ReactNode, action: string, onAct: () => void) => (
    <div className="cycle-banner cycle-banner-suggest">
      <div className="cycle-banner-row">
        <span className="cycle-banner-text">
          {summary}
          {text}
        </span>
        <button type="button" onClick={onAct}>
          {action}
        </button>
      </div>
      {strips}
    </div>
  );

  if (status.periodExpected) {
    return suggestion(
      <b>{t(lang, "periodStartedQuestion")}</b>,
      t(lang, "yesToday"),
      onConfirmPeriod,
    );
  }
  if (status.phaseStartsToday) {
    return suggestion(null, t(lang, "switchProfile"), onSuggestProfile);
  }
  return (
    <Link to={`/settings#${CYCLE_CHART_ANCHOR}`} className="cycle-banner">
      <div className="cycle-banner-row">
        {summary}
        <Icon name="chevron" />
      </div>
      {strips}
    </Link>
  );
}
