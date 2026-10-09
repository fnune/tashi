import "./Toggle.css";

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="toggle"
      aria-label={label}
      aria-checked={checked}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}
