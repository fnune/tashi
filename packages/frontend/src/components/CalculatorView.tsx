import type {
  CalculateRequest,
  CalculationResult,
  InsulinOnBoard,
  Settings,
} from "@pincho/shared";
import { useState } from "react";
import { Link } from "react-router";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { ResultTable } from "./ResultTable.js";

export interface CalculatorFormState {
  foodText: string;
  bloodSugar: string;
  preBolus: string;
}

interface CalculatorViewProps {
  settings: Settings;
  lang: Language;
  iob: InsulinOnBoard | null;
  onNewResult: () => void;
  formState: CalculatorFormState;
  onFormChange: (state: CalculatorFormState) => void;
}

export function CalculatorView({
  settings,
  lang,
  iob,
  onNewResult,
  formState,
  onFormChange,
}: CalculatorViewProps) {
  const { foodText, bloodSugar, preBolus } = formState;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clarification, setClarification] = useState<{
    kind: "needs_clarification" | "rejected";
    message: string;
  } | null>(null);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [configPrompt, setConfigPrompt] = useState<string | null>(null);

  function update(patch: Partial<CalculatorFormState>) {
    onFormChange({ ...formState, ...patch });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!foodText.trim()) return;

    setLoading(true);
    setError(null);
    setClarification(null);
    setConfigPrompt(null);
    setResult(null);

    const req: CalculateRequest = {
      food_description: foodText.trim(),
    };
    if (bloodSugar) {
      req.current_blood_sugar = Number.parseFloat(bloodSugar);
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
      if (
        err instanceof api.ApiError &&
        (err.code === "bolus_insulin_not_configured" ||
          err.code === "insulin_action_not_configured" ||
          err.code === "no_meal_window")
      ) {
        setConfigPrompt(t(lang, err.code));
      } else {
        setError(apiErrorText(lang, err));
      }
    } finally {
      setLoading(false);
    }
  }

  const insulinConfigured =
    settings.bolus_insulin_id !== null &&
    settings.insulin_action_minutes !== null;

  return (
    <div>
      <div className="iob-banner">
        {!insulinConfigured ? (
          <span>
            {t(lang, "iobSetupPrompt")}{" "}
            <Link to="/settings" className="iob-setup-link">
              {t(lang, "goToSettings")}
            </Link>
          </span>
        ) : iob !== null && iob.total_units > 0.05 ? (
          <span>
            {t(lang, "insulinOnBoard")}: {iob.total_units.toFixed(1)} U.
          </span>
        ) : (
          <span>{t(lang, "iobZero")}</span>
        )}
      </div>
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

      {configPrompt && (
        <div className="info-box">
          <span>{configPrompt}</span>
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
