import { type ReactNode, useId } from "react";
import "./OptionList.css";
import { flag, useFocusVisible } from "./useFocusVisible.js";

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
  const { isFocusVisible, focusHandlers } = useFocusVisible<T>();
  return (
    <fieldset className="option-list">
      <legend className="visually-hidden">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className="option"
          data-checked={flag(o.value === value)}
          data-focus-visible={flag(isFocusVisible(o.value))}
        >
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            {...focusHandlers(o.value)}
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
