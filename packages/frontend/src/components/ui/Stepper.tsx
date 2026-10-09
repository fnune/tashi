import "./Stepper.css";

export function Stepper({
  value,
  step,
  unit,
  format,
  decreaseLabel,
  increaseLabel,
  onChange,
}: {
  value: number;
  step: number;
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
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - step))}
      >
        −
      </button>
      <output>
        {format(value)} <small>{unit}</small>
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
