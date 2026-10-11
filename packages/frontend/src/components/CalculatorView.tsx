import type {
  CalculateRequest,
  CalculationResult,
  InsulinOnBoard,
  Settings,
  TimelineEntry,
} from "@tashi/shared";
import {
  cycleStatus,
  latestRecentReading,
  recalculateResult,
  toLocalDateString,
  withWeight,
} from "@tashi/shared";
import { type Dispatch, type SetStateAction, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { DoseSummary, FoodList, totalDose } from "./DoseResult.js";
import { ProfileChips } from "./ProfileChips.js";
import { ProfileSwitcher } from "./ProfileSwitcher.js";
import { SensorCard } from "./SensorCard.js";
import { Button } from "./ui/Button.js";
import { Notice } from "./ui/Notice.js";
import { Segmented } from "./ui/Segmented.js";
import { Sheet } from "./ui/Sheet.js";
import "./CalculatorView.css";
import { numberFormat } from "../numberFormat.js";

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
    if (!foodText.trim() || loading) return;

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
      const decimal = numberFormat(lang);
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

  const decimal = numberFormat(lang);

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

      {logged && <Notice tone="ok">{logged}</Notice>}

      {result ? (
        <>
          <FoodList
            result={result}
            lang={lang}
            onWeightChange={(index, weight) => {
              const items = result.items.map((item, i) =>
                i === index ? withWeight(item, weight) : item,
              );
              const next = recalculateResult(result, items, settings);
              update({ result: next, units: totalDose(next) ?? 0 });
            }}
          />
          <DoseSummary
            result={result}
            lang={lang}
            ratioFormat={settings.ratio_format}
            penIncrement={settings.pen_increment}
            units={units}
            onUnitsChange={(next) => update({ units: next })}
          />
          <Button disabled={logging} onClick={() => logMeal(result)}>
            {units > 0
              ? t(lang, "logUnits").replace("{units}", decimal.format(units))
              : t(lang, "logMealOnly")}
          </Button>
          <section className="meal-summary">
            <p>{result.input_text}</p>
            <Button
              variant="text"
              onClick={() => {
                update({ result: null });
              }}
            >
              {t(lang, "changeMeal")}
            </Button>
          </section>
        </>
      ) : (
        <form className="meal-form" onSubmit={handleSubmit}>
          <div className="section">
            <label className="section-heading" htmlFor="meal-text">
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
          </div>
          <div className="section">
            <span className="section-heading" aria-hidden="true">
              {t(lang, "eatingIn")}
            </span>
            <Segmented
              variant="pills"
              label={t(lang, "eatingIn")}
              value={preBolusMinutes}
              options={PRE_BOLUS_OPTIONS.map((minutes) => ({
                value: minutes,
                label: minutes ? `${minutes} min` : t(lang, "now"),
              }))}
              onChange={(minutes) => update({ preBolusMinutes: minutes })}
            />
          </div>
          <div className="meal-form-submit">
            <Button
              type="submit"
              disabled={!foodText.trim()}
              aria-busy={loading || undefined}
            >
              {loading ? t(lang, "calculating") : t(lang, "calculateDose")}
            </Button>
            <p
              className="meal-form-why"
              data-hidden={foodText.trim() !== "" || loading || undefined}
            >
              {t(lang, "calculateNeedsFood")}
            </p>
          </div>
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
