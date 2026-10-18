import type { CyclePhase } from "@tashi/shared";
import { cyclePhaseRanges, typicalInsulinResistance } from "@tashi/shared";
import type { CSSProperties } from "react";
import "./CycleStrips.css";

function resistanceCurve(length: number): { line: string; area: string } {
  const height = (day: number) =>
    (1 - typicalInsulinResistance(day, length)).toFixed(3);
  const dayCentres = Array.from(
    { length },
    (_, i) => `${(i + 0.5).toFixed(2)} ${height(i + 1)}`,
  );
  const points = [
    `0 ${height(1)}`,
    ...dayCentres,
    `${length} ${height(length)}`,
  ];
  const line = `M${points.join("L")}`;
  return { line, area: `${line}L${length} 1L0 1Z` };
}

export function CycleStrips({
  length,
  currentPhase,
  today,
  compact = false,
  labels,
}: {
  length: number;
  currentPhase: CyclePhase | null;
  today?: number | null;
  compact?: boolean;
  labels?: Record<CyclePhase, string>;
}) {
  const style = { "--days": length, "--today": today ?? 0 } as CSSProperties;
  const ranges = cyclePhaseRanges(length);
  const curve = resistanceCurve(length);

  return (
    <div
      className={compact ? "cycle-strips cycle-strips-compact" : "cycle-strips"}
      style={style}
      aria-hidden="true"
    >
      <svg
        className="cycle-strips-resistance"
        viewBox={`0 0 ${length} 1`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="cycle-strips-resistance-area" d={curve.area} />
        <path className="cycle-strips-resistance-line" d={curve.line} />
      </svg>
      <div className="cycle-strips-track">
        <div className="cycle-strips-phases">
          {ranges.map((range) => (
            <span
              key={range.phase}
              data-phase={range.phase}
              data-current={range.phase === currentPhase || undefined}
              style={{ gridColumn: `${range.firstDay} / ${range.lastDay + 1}` }}
            />
          ))}
        </div>
        {compact && today != null && <span className="cycle-strips-today" />}
      </div>
      {!compact && today != null && <span className="cycle-strips-today" />}
      {labels && (
        <div className="cycle-strips-labels">
          {ranges.map((range) => (
            <span
              key={range.phase}
              data-phase={range.phase}
              style={{ gridColumn: `${range.firstDay} / ${range.lastDay + 1}` }}
            >
              {labels[range.phase]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
