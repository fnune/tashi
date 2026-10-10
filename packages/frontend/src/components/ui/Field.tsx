import { type ReactNode, useId } from "react";
import "./Field.css";

function Field({
  label,
  hint,
  error,
  hideLabel = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="field">
      <label
        className={hideLabel ? "visually-hidden" : "field-label"}
        htmlFor={id}
      >
        {label}
      </label>
      {children(id, error ? errorId : undefined)}
      {hint && <span className="field-hint">{hint}</span>}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          className="field-input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}

export function parseDecimal(text: string): number | null {
  const value = Number.parseFloat(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

export function NumberField({
  label,
  hint,
  error,
  hideLabel,
  value,
  unit,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel}>
      {(id, describedBy) => (
        <div className="field-number">
          <input
            id={id}
            className="field-input field-input-number"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {unit && (
            <span className="field-unit" aria-hidden="true">
              {unit}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          className="field-input"
          value={value}
          onChange={(e) => {
            const picked = options.find(
              (o) => String(o.value) === e.target.value,
            );
            if (picked) onChange(picked.value);
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          className="field-input"
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  );
}
