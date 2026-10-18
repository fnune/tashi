import type { MealWindow } from "@tashi/shared";
import { windowLength } from "@tashi/shared";
import "./DayBar.css";

const SERIES_COUNT = 4;
const TICKS = [0, 6, 12, 18, 24];

function segments(window: MealWindow) {
  const start = window.start_hour;
  const end = start + windowLength(window);
  if (end <= 24) return [{ start, end }];
  return [
    { start, end: 24 },
    { start: 0, end: end - 24 },
  ];
}

export function DayBar({ windows }: { windows: MealWindow[] }) {
  return (
    <div className="day-bar" aria-hidden="true">
      <div className="day-bar-track">
        {windows.flatMap((window, i) =>
          segments(window).map((segment) => (
            <span
              key={`${window.name}-${i}-${segment.start}`}
              className={`day-bar-segment day-bar-series-${(i % SERIES_COUNT) + 1}`}
              style={
                {
                  "--start": segment.start,
                  "--span": segment.end - segment.start,
                } as React.CSSProperties
              }
            />
          )),
        )}
      </div>
      <div className="day-bar-ticks">
        {TICKS.map((hour) => (
          <span key={hour}>{`${String(hour).padStart(2, "0")}:00`}</span>
        ))}
      </div>
    </div>
  );
}
