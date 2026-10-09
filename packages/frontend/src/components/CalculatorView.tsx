import type {
  CalculateRequest,
  CalculationResult,
  InsulinOnBoard,
  Settings,
  TimelineEntry,
} from "@pincho/shared";
import { cycleStatus, latestRecentReading } from "@pincho/shared";
import { useState } from "react";
import { Link } from "react-router";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { MealBreakdown, totalDose } from "./MealBreakdown.js";
import { ProfileChips } from "./ProfileChips.js";
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
  onSettingsSaved: (settings: Settings) => void;
  lang: Language;
  iob: InsulinOnBoard | null;
  timeline: TimelineEntry[];
  onDataChanged: () => void;
  formState: CalculatorFormState;
  onFormChange: (state: CalculatorFormState) => void;
}

const PRE_BOLUS_OPTIONS = [0, 10, 20, 30];
const PROFILE_CHIPS_ID = "profile-chips";

const SETUP_ERRORS = new Set([
  "bolus_insulin_not_configured",
  "insulin_action_not_configured",
  "no_meal_window",
]);

export function CalculatorView({
  settings,
  onSettingsSaved,
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
  const [units, setUnits] = useState(0);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const reading = latestRecentReading(timeline, new Date());

  async function saveReading(value: number) {
    await api.createTimelineEntry({
      type: "glucose_reading",
      value,
      unit: settings.glucose_unit,
    });
    onDataChanged();
  }

  async function selectProfile(profileId: string) {
    setError(null);
    try {
      onSettingsSaved(
        await api.saveSettings({ ...settings, active_profile_id: profileId }),
      );
    } catch (err) {
      setError(apiErrorText(lang, err));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodText.trim()) return;

    setLoading(true);
    setError(null);
    setClarification(null);
    setSetupPrompt(null);
    setLogged(null);
    setResult(null);

    const req: CalculateRequest = { food_description: foodText.trim() };
    if (reading) req.current_blood_sugar = reading.value;

    try {
      const res = await api.calculate(req);
      if (res.status === "ok") {
        setResult(res.result);
        setUnits(totalDose(res.result) ?? 0);
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

  async function logMeal(meal: CalculationResult) {
    setLogging(true);
    setError(null);
    try {
      await api.logMeal({
        result: meal,
        units,
        pre_bolus_minutes: preBolusMinutes,
      });
      const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
      setLogged(
        units > 0
          ? t(lang, "loggedMealAndUnits").replace(
              "{units}",
              decimal.format(units),
            )
          : t(lang, "loggedMealOnly"),
      );
      setResult(null);
      onFormChange({ ...formState, foodText: "" });
      onDataChanged();
    } catch (err) {
      setError(apiErrorText(lang, err));
    } finally {
      setLogging(false);
    }
  }

  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });

  return (
    <div className="calculator">
      <SensorCard
        settings={settings}
        lang={lang}
        reading={reading}
        iob={iob}
        cycle={cycleStatus(settings.cycle, new Date())}
        onSaveReading={saveReading}
        onSuggestProfile={() => {
          const chips = document.getElementById(PROFILE_CHIPS_ID);
          chips?.scrollIntoView({ behavior: "smooth", block: "center" });
          chips?.querySelector<HTMLInputElement>("input:checked")?.focus({
            preventScroll: true,
          });
        }}
      />

      <ProfileChips
        id={PROFILE_CHIPS_ID}
        settings={settings}
        lang={lang}
        onSelect={selectProfile}
      />

      {logged && <p className="calculator-logged">✓ {logged}</p>}

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
            injection={{ units, onChange: setUnits }}
          />
          <Button disabled={logging} onClick={() => logMeal(result)}>
            {units > 0
              ? t(lang, "logMealAndUnits").replace(
                  "{units}",
                  decimal.format(units),
                )
              : t(lang, "logMealOnly")}
          </Button>
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
