import type { CalculationStep } from "@tashi/shared";
import { type Language, t } from "../i18n.js";
import { Logo } from "./Logo.js";
import { Button } from "./ui/Button.js";
import "./CalculationProgress.css";

function stepText(lang: Language, step: CalculationStep): string {
  switch (step.type) {
    case "reading":
      return t(lang, "stepReading");
    case "looking_up":
      return t(lang, "stepLookingUp").replace(
        "{food}",
        t(lang, "quotedFood").replace("{food}", step.query),
      );
    case "taking_longer":
      return t(lang, "stepTakingLonger");
    case "working_out":
      return t(lang, "stepWorkingOut");
  }
}

export function CalculationProgress({
  steps,
  lang,
  onCancel,
}: {
  steps: CalculationStep[];
  lang: Language;
  onCancel: () => void;
}) {
  const current = steps.at(-1);
  return (
    <section
      className="calculation-progress"
      aria-label={t(lang, "calculating")}
    >
      <span className="calculation-progress-halo">
        <Logo className="calculation-progress-mark" />
      </span>
      <p className="calculation-progress-step" aria-live="polite">
        {current && (
          // A new key per step restarts the fade-in.
          <span key={steps.length}>{stepText(lang, current)}</span>
        )}
      </p>
      <Button variant="text" onClick={onCancel}>
        {t(lang, "cancel")}
      </Button>
    </section>
  );
}
