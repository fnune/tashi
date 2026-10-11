import "./Stepper.css";

export function Stepper({
  value,
  step,
  min = 0,
  unit,
  format,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  value: number;
  step: number;
  min?: number;
  unit: string;
  format: (value: number) => string;
  decreaseLabel: string;
  increaseLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={decreaseLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <output>
        <b>{format(value)}</b> <small>{unit}</small>
      </output>
      <button
        type="button"
        aria-label={increaseLabel}
        onClick={() => onChange(value + step)}
      >
        +
      </button>
    </div>
  );
}
