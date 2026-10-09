import { ovulationDay } from "@pincho/shared";
import "./HormoneChart.css";

const WIDTH = 360;
const HEIGHT = 150;
const PAD_X = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const PERIOD_DAYS = 5;
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

export function HormoneChart({
  length,
  today,
  label,
}: {
  length: number;
  today: number | null;
  label: string;
}) {
  const ovulation = ovulationDay(length);
  const x = (day: number) =>
    PAD_X + ((day - 1) / (length - 1)) * (WIDTH - 2 * PAD_X);
  const y = (level: number) =>
    PAD_TOP + (1 - level) * (HEIGHT - PAD_TOP - PAD_BOTTOM);
  const path = (curve: (day: number, ovulation: number) => number) =>
    Array.from({ length: (length - 1) * SAMPLES_PER_DAY + 1 }, (_, i) => {
      const day = 1 + i / SAMPLES_PER_DAY;
      return `${i ? "L" : "M"}${x(day).toFixed(1)} ${y(curve(day, ovulation)).toFixed(1)}`;
    }).join(" ");
  const ticks = [1, PERIOD_DAYS + 1, ovulation, length];

  return (
    <svg
      className="hormone-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={label}
    >
      <rect
        className="hormone-chart-period"
        x={x(1)}
        y={PAD_TOP}
        width={x(PERIOD_DAYS + 1) - x(1)}
        height={HEIGHT - PAD_TOP - PAD_BOTTOM}
      />
      <rect
        className="hormone-chart-luteal"
        x={x(ovulation + 1)}
        y={PAD_TOP}
        width={x(length) - x(ovulation + 1)}
        height={HEIGHT - PAD_TOP - PAD_BOTTOM}
      />
      <path className="hormone-chart-estradiol" d={path(estradiol)} />
      <path className="hormone-chart-progesterone" d={path(progesterone)} />
      {today !== null && (
        <line
          className="hormone-chart-today"
          x1={x(today)}
          x2={x(today)}
          y1={PAD_TOP}
          y2={HEIGHT - PAD_BOTTOM}
        />
      )}
      {ticks.map((day) => (
        <text key={day} x={x(day)} y={HEIGHT - 6} textAnchor="middle">
          {day}
        </text>
      ))}
    </svg>
  );
}
