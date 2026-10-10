import type { CyclePhase } from "@pincho/shared";
import { cyclePhaseRanges, ovulationDay } from "@pincho/shared";
import type { CSSProperties } from "react";
import { type Language, t } from "../i18n.js";
import { CycleStrips } from "./CycleStrips.js";
import "./CycleChart.css";

const UNITS_PER_DAY = 10;
const PLOT_HEIGHT = 100;
const SAMPLES_PER_DAY = 4;

function bell(x: number, centre: number, width: number): number {
  return Math.exp(-(((x - centre) / width) ** 2));
}

function estradiol(day: number, ovulation: number): number {
  return bell(day, ovulation - 1, 2.2) + 0.45 * bell(day, ovulation + 7, 3.5);
}

function progesterone(day: number, ovulation: number): number {
  return day <= ovulation ? 0.03 : bell(day, ovulation + 7, 3.8);
}

function curvePath(
  curve: (day: number, ovulation: number) => number,
  length: number,
): string {
  const ovulation = ovulationDay(length);
  const top = PLOT_HEIGHT * 0.08;
  const bottom = PLOT_HEIGHT * 0.95;
  return Array.from({ length: (length - 1) * SAMPLES_PER_DAY + 1 }, (_, i) => {
    const day = 1 + i / SAMPLES_PER_DAY;
    const x = (day - 0.5) * UNITS_PER_DAY;
    const y = bottom - curve(day, ovulation) * (bottom - top);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function phaseDays(
  lang: Language,
  range: { firstDay: number; lastDay: number },
): string {
  return range.firstDay === range.lastDay
    ? t(lang, "phaseDay").replace("{day}", String(range.firstDay))
    : t(lang, "phaseDays")
        .replace("{first}", String(range.firstDay))
        .replace("{last}", String(range.lastDay));
}

export function CycleChart({
  length,
  today,
  currentPhase,
  lang,
}: {
  length: number;
  today: number | null;
  currentPhase: CyclePhase | null;
  lang: Language;
}) {
  const ranges = cyclePhaseRanges(length);
  const ovulation = ovulationDay(length);
  const plotStyle = {
    "--days": length,
    "--today": today ?? 0,
  } as CSSProperties;
  const atDay = (day: number) => ({ "--day": day }) as CSSProperties;

  return (
    <figure className="cycle-chart">
      <div className="cycle-chart-plot" style={plotStyle}>
        <svg
          className="cycle-chart-curves"
          viewBox={`0 0 ${length * UNITS_PER_DAY} ${PLOT_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className="cycle-chart-estradiol"
            d={curvePath(estradiol, length)}
            vectorEffect="non-scaling-stroke"
          />
          <path
            className="cycle-chart-progesterone"
            d={curvePath(progesterone, length)}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="cycle-chart-track-label" aria-hidden="true">
          {t(lang, "resistanceTrack")}
        </span>
        <CycleStrips length={length} currentPhase={currentPhase} />
        <span
          className="cycle-chart-curve-label"
          style={atDay(ovulation - 1)}
          aria-hidden="true"
        >
          {t(lang, "estradiol")}
        </span>
        <span
          className="cycle-chart-curve-label"
          style={atDay(ovulation + 7)}
          aria-hidden="true"
        >
          {t(lang, "progesterone")}
        </span>
        {today !== null && (
          <div className="cycle-chart-today">
            <span>{t(lang, "today")}</span>
          </div>
        )}
      </div>

      <dl className="cycle-chart-lines">
        <div data-line="estradiol">
          <dt>{t(lang, "estradiol")}</dt>
          <dd>{t(lang, "estradiolMeaning")}</dd>
        </div>
        <div data-line="progesterone">
          <dt>{t(lang, "progesterone")}</dt>
          <dd>{t(lang, "progesteroneMeaning")}</dd>
        </div>
        <div data-line="resistance">
          <dt>
            {t(lang, "resistanceTrack")}
            <span className="cycle-chart-scale">
              {t(lang, "less")}
              <i aria-hidden="true" />
              {t(lang, "more")}
            </span>
          </dt>
          <dd>{t(lang, "resistanceMeaning")}</dd>
        </div>
      </dl>

      <ol className="cycle-phases">
        {ranges.map((range) => {
          const current = range.phase === currentPhase;
          return (
            <li
              key={range.phase}
              data-phase={range.phase}
              data-current={current || undefined}
            >
              <span className="cycle-phase-swatch" aria-hidden="true" />
              <span className="cycle-phase-text">
                <b>{t(lang, `phase_${range.phase}`)}</b>
                <span>
                  {phaseDays(lang, range)}
                  {range.phase === "luteal" && ` · ${t(lang, "lutealNote")}`}
                </span>
                {current && today !== null && (
                  <em>
                    {t(lang, "youAreHere").replace("{day}", String(today))}
                  </em>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
