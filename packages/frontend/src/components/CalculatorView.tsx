import type {
  CalculateRequest,
  CalculationResult,
  InsulinOnBoard,
  Settings,
  TimelineEntry,
} from "@pincho/shared";
import {
  cycleStatus,
  latestRecentReading,
  toLocalDateString,
} from "@pincho/shared";
import { type Dispatch, type SetStateAction, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { MealBreakdown, totalDose } from "./MealBreakdown.js";
import { ProfileChips } from "./ProfileChips.js";
import { ProfileSwitcher } from "./ProfileSwitcher.js";
import { SensorCard } from "./SensorCard.js";
import { Button } from "./ui/Button.js";
import { Notice } from "./ui/Notice.js";
import { Segmented } from "./ui/Segmented.js";
import { Sheet } from "./ui/Sheet.js";
import "./CalculatorView.css";

export interface CalculatorFormState {
  foodText: string;
  preBolusMinutes: number;
  result: CalculationResult | null;
  units: number;
}

interface CalculatorViewProps {
  settings: Settings;
  onSettingsSaved: (settings: Settings) => void;
  lang: Language;
  iob: InsulinOnBoard | null;
  timeline: TimelineEntry[];
  onDataChanged: () => void;
  formState: CalculatorFormState;
  onFormChange: Dispatch<SetStateAction<CalculatorFormState>>;
}

const PRE_BOLUS_OPTIONS = [0, 10, 20, 30];

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
  const { foodText, preBolusMinutes, result, units } = formState;
  const update = (patch: Partial<CalculatorFormState>) =>
    onFormChange((current) => ({ ...current, ...patch }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    kind: "needs_clarification" | "rejected";
    message: string;
  } | null>(null);
  const [setupPrompt, setSetupPrompt] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const cycle = cycleStatus(settings.cycle, new Date());
  const reading = latestRecentReading(timeline, new Date());

  async function saveReading(value: number) {
    await api.createTimelineEntry({
      type: "glucose_reading",
      value,
      unit: settings.glucose_unit,
    });
    onDataChanged();
  }

  async function saveSettings(next: Settings) {
    setError(null);
    try {
      onSettingsSaved(await api.saveSettings(next));
    } catch (err) {
      setError(apiErrorText(lang, err));
    }
  }

  function selectProfile(profileId: string) {
    return saveSettings({ ...settings, active_profile_id: profileId });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodText.trim()) return;

    setLoading(true);
    setError(null);
    setClarification(null);
    setSetupPrompt(null);
    setLogged(null);
    update({ result: null });

    const req: CalculateRequest = { food_description: foodText.trim() };
    if (reading) req.current_blood_sugar = reading.value;

    try {
      const res = await api.calculate(req);
      if (res.status === "ok") {
        update({ result: res.result, units: totalDose(res.result) ?? 0 });
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
      update({ result: null, foodText: "" });
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
        cycle={cycle}
        onSaveReading={saveReading}
        onSuggestProfile={() => setSwitchingProfile(true)}
        onConfirmPeriod={() =>
          saveSettings({
            ...settings,
            cycle: {
              ...settings.cycle,
              last_period_start: toLocalDateString(new Date()),
            },
          })
        }
      />

      <ProfileChips settings={settings} lang={lang} onSelect={selectProfile} />

      {logged && <Notice tone="ok">✓ {logged}</Notice>}

      {result ? (
        <>
          <section className="meal-summary">
            <p>{result.input_text}</p>
            <button
              type="button"
              className="meal-summary-change"
              onClick={() => update({ result: null })}
            >
              {t(lang, "changeMeal")}
            </button>
          </section>
          <MealBreakdown
            result={result}
            lang={lang}
            penIncrement={settings.pen_increment}
            injection={{ units, onChange: (next) => update({ units: next }) }}
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
            onChange={(e) => update({ foodText: e.target.value })}
            placeholder={t(lang, "foodPlaceholder")}
          />
          {clarification && (
            <Notice
              tone={clarification.kind === "rejected" ? "danger" : "warn"}
            >
              {clarification.message}
            </Notice>
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
              onChange={(minutes) => update({ preBolusMinutes: minutes })}
            />
          </div>
          <Button type="submit" disabled={loading || !foodText.trim()}>
            {loading ? t(lang, "calculating") : t(lang, "calculateDose")}
          </Button>
        </form>
      )}

      {error && <Notice tone="danger">{error}</Notice>}

      {setupPrompt && (
        <Notice
          tone="info"
          action={{ label: t(lang, "goToSettings"), to: "/settings" }}
        >
          {setupPrompt}
        </Notice>
      )}

      {loading && (
        <div className="calculator-loading" role="status">
          <span className="calculator-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          {t(lang, "calculating")}
        </div>
      )}
      <Sheet
        open={switchingProfile}
        title={t(lang, "switchProfile")}
        closeLabel={t(lang, "close")}
        onClose={() => setSwitchingProfile(false)}
      >
        {cycle && (
          <ProfileSwitcher
            settings={settings}
            lang={lang}
            phase={cycle.phase}
            onSelect={async (profileId) => {
              await selectProfile(profileId);
              setSwitchingProfile(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
