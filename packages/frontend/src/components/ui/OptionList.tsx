import { type ReactNode, useId } from "react";
import "./OptionList.css";

export function OptionList<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; title: string; detail?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="option-list">
      <legend className="visually-hidden">{label}</legend>
      {options.map((o) => (
        <label key={o.value} className="option">
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
          />
          <span className="option-dot" aria-hidden="true" />
          <span className="option-text">
            <span className="option-title">{o.title}</span>
            {o.detail && <span className="option-detail">{o.detail}</span>}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
