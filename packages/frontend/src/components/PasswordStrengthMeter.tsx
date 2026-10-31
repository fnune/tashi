import { type Language, t } from "../i18n.js";
import {
  longEnough,
  type PasswordStrength,
  REQUIRED_SCORE,
} from "../password-strength.js";
import "./PasswordStrengthMeter.css";

const SCORE_LABELS = [
  "passwordStrength0",
  "passwordStrength1",
  "passwordStrength2",
  "passwordStrength3",
  "passwordStrength4",
] as const;

export function PasswordStrengthMeter({
  lang,
  password,
  strength,
}: {
  lang: Language;
  password: string;
  strength: PasswordStrength | null;
}) {
  if (password === "") {
    return <p className="password-hint">{t(lang, "passwordHint")}</p>;
  }
  const score = longEnough(password) ? (strength?.score ?? 0) : 0;
  const tone = score >= REQUIRED_SCORE ? "strong" : "weak";
  return (
    <div className="password-strength">
      <meter
        className="visually-hidden"
        min={0}
        max={4}
        value={score}
        aria-label={t(lang, "passwordStrengthLabel")}
        aria-valuetext={t(lang, SCORE_LABELS[score])}
      />
      <div className={`password-strength-bar ${tone}`} aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span key={step} className={step <= score ? "filled" : undefined} />
        ))}
      </div>
      <p className="password-hint">
        <strong>{t(lang, SCORE_LABELS[score])}.</strong>{" "}
        {longEnough(password)
          ? (strength?.feedback ?? "")
          : t(lang, "passwordTooShort")}
      </p>
    </div>
  );
}
