import type { CyclePhase } from "@pincho/shared";
import { cyclePhaseRanges, typicalInsulinResistance } from "@pincho/shared";
import type { CSSProperties } from "react";
import "./CycleStrips.css";

export function CycleStrips({
  length,
  currentPhase,
  today,
  compact = false,
}: {
  length: number;
  currentPhase: CyclePhase | null;
  today?: number | null;
  compact?: boolean;
}) {
  const style = { "--days": length, "--today": today ?? 0 } as CSSProperties;
  return (
    <div
      className={compact ? "cycle-strips cycle-strips-compact" : "cycle-strips"}
      style={style}
      aria-hidden="true"
    >
      <div className="cycle-strips-heat">
        {Array.from({ length }, (_, i) => (
          <span
            key={`day-${i + 1}`}
            style={
              {
                "--level": typicalInsulinResistance(i + 1, length),
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="cycle-strips-phases">
        {cyclePhaseRanges(length).map((range) => (
          <span
            key={range.phase}
            data-phase={range.phase}
            data-current={range.phase === currentPhase || undefined}
            style={{ gridColumn: `${range.firstDay} / ${range.lastDay + 1}` }}
          />
        ))}
      </div>
      {today != null && <span className="cycle-strips-today" />}
    </div>
  );
}
