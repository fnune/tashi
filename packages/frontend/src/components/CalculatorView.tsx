import type {
  CalculateRequest,
  CalculationResult,
  Settings,
} from "@pincho/shared";
import { useState } from "react";
import * as api from "../api.js";
import { type Language, t } from "../i18n.js";
import { ResultTable } from "./ResultTable.js";

export interface CalculatorFormState {
  foodText: string;
  bloodSugar: string;
  mealOverride: string;
  preBolus: string;
}

interface CalculatorViewProps {
  settings: Settings;
  lang: Language;
  onNewResult: () => void;
  formState: CalculatorFormState;
  onFormChange: (state: CalculatorFormState) => void;
}

export function CalculatorView({
  settings,
  lang,
  onNewResult,
  formState,
  onFormChange,
}: CalculatorViewProps) {
  const { foodText, bloodSugar, mealOverride, preBolus } = formState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    kind: "needs_clarification" | "rejected";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);

  function update(patch: Partial<CalculatorFormState>) {
    onFormChange({ ...formState, ...patch });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodText.trim()) return;

    setLoading(true);
    setError(null);
    setClarification(null);
    setResult(null);

    const req: CalculateRequest = {
      food_description: foodText.trim(),
    };
    if (bloodSugar) {
      req.current_blood_sugar = Number.parseFloat(bloodSugar);
    }
    if (mealOverride) {
      req.meal_window_override = mealOverride;
    }
    if (preBolus) {
      req.pre_bolus_minutes = Number.parseInt(preBolus, 10);
    }

    try {
      const res = await api.calculate(req);
      if (res.status === "ok") {
        setResult(res.result);
        onNewResult();
      } else {
        setClarification({ kind: res.status, message: res.message });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form className="calculator-form" onSubmit={handleSubmit}>
        <textarea
          className="food-input"
          value={foodText}
          onChange={(e) => update({ foodText: e.target.value })}
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
        <div className="input-row">
          <div className="input-group">
            <label htmlFor="blood-sugar">
              {t(lang, "currentBloodSugar")} ({settings.glucose_unit},{" "}
              {t(lang, "optional")})
            </label>
            <input
              id="blood-sugar"
              type="number"
              step="0.1"
              min="0"
              value={bloodSugar}
              onChange={(e) => update({ bloodSugar: e.target.value })}
            />
          </div>
          <div className="input-group">
            <label htmlFor="meal-window">{t(lang, "mealWindow")}</label>
            <select
              id="meal-window"
              value={mealOverride}
              onChange={(e) => update({ mealOverride: e.target.value })}
            >
              <option value="">{t(lang, "auto")}</option>
              {settings.meal_windows.map((w) => (
                <option key={w.name} value={w.name}>
                  {w.name} ({w.start_hour}:00-{w.end_hour}:00 | 1U:{w.ratio}g)
                </option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label htmlFor="pre-bolus">
              {t(lang, "eatingIn")} ({t(lang, "minutes")})
            </label>
            <input
              id="pre-bolus"
              type="number"
              min="0"
              max="60"
              step="1"
              value={preBolus}
              onChange={(e) => update({ preBolus: e.target.value })}
              placeholder="0"
            />
          </div>
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !foodText.trim()}
        >
          {loading ? t(lang, "calculating") : t(lang, "calculate")}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {loading && (
        <div className="loading-box">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span>{t(lang, "calculating")}</span>
        </div>
      )}

      {result && (
        <ResultTable
          result={result}
          lang={lang}
          glucoseUnit={settings.glucose_unit}
        />
      )}
    </div>
  );
}
