import type { CyclePhase, CycleStatus } from "@pincho/shared";
import { Link } from "react-router";
import { type Language, t } from "../i18n.js";
import "./CycleChip.css";

const MOONS: Record<CyclePhase, string> = {
  period: "🌑",
  follicular: "🌒",
  ovulation: "🌕",
  luteal: "🌘",
};

export function CycleChip({
  status,
  lang,
  onSuggestProfile,
}: {
  status: CycleStatus;
  lang: Language;
  onSuggestProfile: () => void;
}) {
  const label = `${MOONS[status.phase]} ${t(lang, "cycleDayShort").replace(
    "{day}",
    String(status.day),
  )} · ${t(lang, `phaseShort_${status.phase}`)}`;

  if (status.phaseStartsToday) {
    return (
      <button
        type="button"
        className="cycle-chip cycle-chip-suggest"
        onClick={onSuggestProfile}
      >
        <span>{label}</span>
        <b>{t(lang, "switchProfile")}</b>
      </button>
    );
  }
  return (
    <Link to="/settings#cycle" className="cycle-chip">
      {label}
    </Link>
  );
}
