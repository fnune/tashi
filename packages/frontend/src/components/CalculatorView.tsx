import type {
  CalculateRequest,
  CalculationResult,
  InsulinOnBoard,
  Settings,
  TimelineEntry,
} from "@pincho/shared";
import { latestRecentReading } from "@pincho/shared";
import { useState } from "react";
import { Link } from "react-router";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { MealBreakdown } from "./MealBreakdown.js";
import { SensorCard } from "./SensorCard.js";
import { Button } from "./ui/Button.js";
import { Segmented } from "./ui/Segmented.js";
import "./CalculatorView.css";

export interface CalculatorFormState {
  foodText: string;
  preBolusMinutes: number;
}

interface CalculatorViewProps {
  settings: Settings;
  lang: Language;
  iob: InsulinOnBoard | null;
  timeline: TimelineEntry[];
  onDataChanged: () => void;
  formState: CalculatorFormState;
  onFormChange: (state: CalculatorFormState) => void;
}

const PRE_BOLUS_OPTIONS = [0, 10, 20, 30];

const SETUP_ERRORS = new Set([
  "bolus_insulin_not_configured",
  "insulin_action_not_configured",
  "no_meal_window",
]);

export function CalculatorView({
  settings,
  lang,
  iob,
  timeline,
  onDataChanged,
  formState,
  onFormChange,
}: CalculatorViewProps) {
  const { foodText, preBolusMinutes } = formState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    kind: "needs_clarification" | "rejected";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [setupPrompt, setSetupPrompt] = useState<string | null>(null);
  const reading = latestRecentReading(timeline, new Date());

  async function saveReading(value: number) {
    await api.createTimelineEntry({
      type: "glucose_reading",
      value,
      unit: settings.glucose_unit,
    });
    onDataChanged();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodText.trim()) return;

    setLoading(true);
    setError(null);
    setClarification(null);
    setSetupPrompt(null);
    setResult(null);

    const req: CalculateRequest = { food_description: foodText.trim() };
    if (reading) req.current_blood_sugar = reading.value;
    if (preBolusMinutes) req.pre_bolus_minutes = preBolusMinutes;

    try {
      const res = await api.calculate(req);
      if (res.status === "ok") {
        setResult(res.result);
        onDataChanged();
      } else {
        setClarification({ kind: res.status, message: res.message });
      }
    } catch (err) {
      if (
        err instanceof api.ApiError &&
        err.code &&
        SETUP_ERRORS.has(err.code)
      ) {
        setSetupPrompt(apiErrorText(lang, err));
      } else {
        setError(apiErrorText(lang, err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="calculator">
      <SensorCard
        settings={settings}
        lang={lang}
        reading={reading}
        iob={iob}
        onSaveReading={saveReading}
      />

      {result ? (
        <>
          <section className="meal-summary">
            <p>{result.input_text}</p>
            <button
              type="button"
              className="meal-summary-change"
              onClick={() => setResult(null)}
            >
              {t(lang, "changeMeal")}
            </button>
          </section>
          <MealBreakdown
            result={result}
            lang={lang}
            penIncrement={settings.pen_increment}
          />
          <p className="calculator-logged">✓ {t(lang, "loggedInHistory")}</p>
        </>
      ) : (
        <form className="meal-form" onSubmit={handleSubmit}>
          <label className="meal-form-label" htmlFor="meal-text">
            {t(lang, "whatAreYouEating")}
          </label>
          <textarea
            id="meal-text"
            className="meal-form-text"
            value={foodText}
            onChange={(e) =>
              onFormChange({ ...formState, foodText: e.target.value })
            }
            placeholder={t(lang, "foodPlaceholder")}
          />
          {clarification && (
            <div
              className={
                clarification.kind === "rejected"
                  ? "rejection-box"
                  : "clarification-box"
              }
            >
              {clarification.message}
            </div>
          )}
          <div className="meal-form-field">
            <span className="meal-form-label">{t(lang, "eatingIn")}</span>
            <Segmented
              label={t(lang, "eatingIn")}
              value={preBolusMinutes}
              options={PRE_BOLUS_OPTIONS.map((minutes) => ({
                value: minutes,
                label: minutes ? `${minutes} min` : t(lang, "now"),
              }))}
              onChange={(minutes) =>
                onFormChange({ ...formState, preBolusMinutes: minutes })
              }
            />
          </div>
          <Button type="submit" disabled={loading || !foodText.trim()}>
            {loading ? t(lang, "calculating") : t(lang, "calculateDose")}
          </Button>
        </form>
      )}

      {error && <div className="error-box">{error}</div>}

      {setupPrompt && (
        <div className="info-box">
          <span>{setupPrompt}</span>
          <Link to="/settings" className="btn btn-small btn-secondary">
            {t(lang, "goToSettings")}
          </Link>
        </div>
      )}

      {loading && (
        <div className="loading-box">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span>{t(lang, "calculating")}</span>
        </div>
      )}
    </div>
  );
}
