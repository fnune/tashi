import type { GlucoseRange, GlucoseUnit } from "@tashi/shared";
import { GLUCOSE_GAUGE_SCALE, GLUCOSE_RANGE_LIMITS } from "@tashi/shared";
import "./GlucoseGauge.css";

const CENTRE = 80;
const RADIUS = 68;
const START = 135;
const SWEEP = 270;
const STROKE = 10;
const BAND_GAP = 3;
// Round caps reach past the path's end, so the band is drawn short by a cap's radius.
const CAP_DEGREES = ((STROKE / 2 / RADIUS) * 180) / Math.PI;

function angle(value: number, unit: GlucoseUnit): number {
  const { min, max } = GLUCOSE_GAUGE_SCALE[unit];
  const clamped = Math.min(Math.max(value, min), max);
  return START + ((clamped - min) / (max - min)) * SWEEP;
}

function point(degrees: number, radius: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  return [
    CENTRE + radius * Math.cos(radians),
    CENTRE + radius * Math.sin(radians),
  ];
}

function arc(from: number, to: number): string {
  const [x0, y0] = point(from, RADIUS);
  const [x1, y1] = point(to, RADIUS);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${RADIUS} ${RADIUS} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export function GlucoseGauge({
  value,
  unit,
  range,
}: {
  value: number | null;
  unit: GlucoseUnit;
  range: GlucoseRange | null;
}) {
  const limits = GLUCOSE_RANGE_LIMITS[unit];
  const low = angle(limits.low, unit);
  const high = angle(limits.high, unit);
  const tick = (degrees: number, label: number) => {
    const [x, y] = point(degrees, RADIUS + 16);
    return (
      <text
        className="gauge-tick"
        x={x.toFixed(1)}
        y={y.toFixed(1)}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {label}
      </text>
    );
  };
  const dot = value === null ? null : point(angle(value, unit), RADIUS);

  return (
    <svg className="gauge-arc" viewBox="-14 -14 188 188" aria-hidden="true">
      <path className="gauge-track" d={arc(START, START + SWEEP)} />
      <path
        className="gauge-band-gap"
        strokeWidth={STROKE + 2 * BAND_GAP}
        d={arc(low + CAP_DEGREES, high - CAP_DEGREES)}
      />
      <path
        className="gauge-band"
        strokeWidth={STROKE}
        d={arc(low + CAP_DEGREES, high - CAP_DEGREES)}
      />
      {tick(low, limits.low)}
      {tick(high, limits.high)}
      {dot && (
        <circle
          className="gauge-dot"
          data-range={range ?? undefined}
          cx={dot[0].toFixed(2)}
          cy={dot[1].toFixed(2)}
          r="10"
        />
      )}
    </svg>
  );
}
