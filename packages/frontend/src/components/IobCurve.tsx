import {
  insulinActivityFraction,
  insulinRemainingFraction,
} from "@pincho/shared";

interface IobCurveProps {
  peakMinutes: number;
  durationMinutes: number;
  peakLabel: string;
}

const WIDTH = 480;
const HEIGHT = 150;
const PAD_X = 12;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;
const SAMPLES = 96;
const ACTIVITY_SCALE = 0.92;

export function IobCurve({
  peakMinutes,
  durationMinutes,
  peakLabel,
}: IobCurveProps) {
  if (peakMinutes * 2 >= durationMinutes) return null;

  const plotW = WIDTH - PAD_X * 2;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xAt = (minutes: number) => PAD_X + (minutes / durationMinutes) * plotW;
  const yAt = (fraction: number) => PAD_TOP + (1 - fraction) * plotH;
  const baseline = yAt(0);

  const samples = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const minutes = (i / SAMPLES) * durationMinutes;
    return {
      minutes,
      iob: insulinRemainingFraction(minutes, peakMinutes, durationMinutes),
      activity: insulinActivityFraction(minutes, peakMinutes, durationMinutes),
    };
  });
  const maxActivity = samples.reduce((m, s) => Math.max(m, s.activity), 0);

  const iobPoints: string[] = [];
  const activityPoints: string[] = [];
  for (const { minutes, iob, activity } of samples) {
    const x = xAt(minutes).toFixed(1);
    iobPoints.push(`${x},${yAt(iob).toFixed(1)}`);
    const activityNorm =
      maxActivity > 0 ? (activity / maxActivity) * ACTIVITY_SCALE : 0;
    activityPoints.push(`${x},${yAt(activityNorm).toFixed(1)}`);
  }

  const iobLine = `M ${iobPoints.join(" L ")}`;
  const activityLine = `M ${activityPoints.join(" L ")}`;
  const activityArea = `${activityLine} Z`;

  const totalHours = Math.floor(durationMinutes / 60);
  const hourTicks = Array.from({ length: totalHours + 1 }, (_, h) => h);

  return (
    <svg
      className="iob-curve"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Insulin curves: activity peaks at ${peakMinutes} minutes; insulin on board falls from the full dose to zero over ${durationMinutes} minutes`}
    >
      <path className="iob-curve-activity-area" d={activityArea} />
      <line
        className="iob-curve-peak"
        x1={xAt(peakMinutes)}
        y1={PAD_TOP}
        x2={xAt(peakMinutes)}
        y2={baseline}
      />
      <text
        className="iob-curve-peak-label"
        x={xAt(peakMinutes)}
        y={PAD_TOP - 8}
        textAnchor="middle"
      >
        {peakLabel}
      </text>
      <path className="iob-curve-activity-line" d={activityLine} />
      <path className="iob-curve-line" d={iobLine} />
      {hourTicks.map((h) => (
        <text
          key={h}
          className="iob-curve-label"
          x={xAt(h * 60)}
          y={HEIGHT - 6}
          textAnchor={h === 0 ? "start" : h === totalHours ? "end" : "middle"}
        >
          {h}h
        </text>
      ))}
    </svg>
  );
}
