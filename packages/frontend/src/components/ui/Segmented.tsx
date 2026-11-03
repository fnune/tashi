import { useId } from "react";
import { flag, useFocusVisible } from "./useFocusVisible.js";
import "./Segmented.css";

export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  variant = "track",
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  variant?: "track" | "pills";
}) {
  const name = useId();
  const { isFocusVisible, focusHandlers } = useFocusVisible<T>();
  return (
    <fieldset className="segmented" data-variant={variant}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
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
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
