import type {
  BasalInsulinId,
  GlucoseUnit,
  MealWindow,
  Settings,
  SourceRef,
} from "@pincho/shared";
import {
  basalInsulinProfiles,
  bolusInsulinProfiles,
  getBolusInsulinProfile,
  MAX_DIA_MINUTES,
  MIN_DIA_MINUTES,
} from "@pincho/shared";
import { useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { IobCurve } from "./IobCurve.js";

interface SettingsViewProps {
  settings: Settings;
  onSave: (s: Settings) => void;
  lang: Language;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

export function SettingsView({ settings, onSave, lang }: SettingsViewProps) {
  const [local, setLocal] = useState<Settings>({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bolusProfile = local.bolus_insulin_id
    ? getBolusInsulinProfile(local.bolus_insulin_id)
    : null;
  const bolusSources = bolusProfile
    ? dedupeSources([bolusProfile.label_source, ...bolusProfile.action.sources])
    : [];
  const dia = local.insulin_action_minutes;
  const diaPlottable =
    bolusProfile != null &&
    dia != null &&
    dia >= MIN_DIA_MINUTES &&
    dia <= MAX_DIA_MINUTES &&
    bolusProfile.action.peak_minutes * 2 < dia;
  const diaOutOfRange = dia != null && !diaPlottable;
  const diaRangeMessage = t(lang, "insulinActionOutOfRange")
    .replace("{min}", String(MIN_DIA_MINUTES))
    .replace("{max}", String(MAX_DIA_MINUTES));

  function updateWindow(
    index: number,
    field: keyof MealWindow,
    value: string | number,
  ) {
    const windows = [...local.meal_windows];
    const window = windows[index];
    if (!window) return;
    windows[index] = { ...window, [field]: value };
    setLocal({ ...local, meal_windows: windows });
  }

  function addWindow() {
    setLocal({
      ...local,
      meal_windows: [
        ...local.meal_windows,
        { name: "", start_hour: 0, end_hour: 24, ratio: 10 },
      ],
    });
  }

  function removeWindow(index: number) {
    const windows = local.meal_windows.filter((_, i) => i !== index);
    setLocal({ ...local, meal_windows: windows });
  }

  function setBolusInsulin(id: string) {
    if (id === "") {
      setLocal({ ...local, bolus_insulin_id: null });
      return;
    }
    const profile = getBolusInsulinProfile(id);
    setLocal({
      ...local,
      bolus_insulin_id: profile.id,
      insulin_action_minutes:
        local.insulin_action_minutes ?? profile.action.duration_minutes,
    });
  }

  function setBasalInsulin(id: string) {
    setLocal({
      ...local,
      basal_insulin_id: id === "" ? null : (id as BasalInsulinId),
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await api.saveSettings(local);
      onSave(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(apiErrorText(lang, e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings">
      <div className="settings-section">
        <h3>{t(lang, "mealWindows")}</h3>
        {local.meal_windows.map((w, i) => (
          <div className="meal-window-row" key={`window-${w.name}-${i}`}>
            <input
              type="text"
              value={w.name}
              placeholder={t(lang, "mealName")}
              onChange={(e) => updateWindow(i, "name", e.target.value)}
            />
            <input
              type="number"
              min="0"
              max="23"
              value={w.start_hour}
              onChange={(e) =>
                updateWindow(
                  i,
                  "start_hour",
                  Number.parseInt(e.target.value, 10),
                )
              }
            />
            <span>-</span>
            <input
              type="number"
              min="0"
              max="24"
              value={w.end_hour}
              onChange={(e) =>
                updateWindow(i, "end_hour", Number.parseInt(e.target.value, 10))
              }
            />
            <input
              type="number"
              min="1"
              step="0.5"
              value={w.ratio}
              onChange={(e) =>
                updateWindow(i, "ratio", Number.parseFloat(e.target.value))
              }
            />
            <span>g/U</span>
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={() => removeWindow(i)}
            >
              {t(lang, "remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={addWindow}
        >
          + {t(lang, "addWindow")}
        </button>
      </div>

      <div className="settings-section">
        <h3>
          {t(lang, "correctionFactor")} ({t(lang, "correctionFactorHint")}{" "}
          {local.glucose_unit})
        </h3>
        <input
          type="number"
          step="0.1"
          min="0"
          value={local.correction_factor ?? ""}
          onChange={(e) =>
            setLocal({
              ...local,
              correction_factor: e.target.value
                ? Number.parseFloat(e.target.value)
                : null,
            })
          }
        />
      </div>

      <div className="settings-section">
        <h3>{t(lang, "fatProteinMultiplier")}</h3>
        <span className="settings-hint">
          {t(lang, "fatProteinMultiplierHint")}
        </span>
        <input
          type="number"
          step="0.05"
          min="0"
          max="1"
          value={local.fat_protein_multiplier}
          onChange={(e) =>
            setLocal({
              ...local,
              fat_protein_multiplier: Number.parseFloat(e.target.value) || 0,
            })
          }
        />
      </div>

      <div className="settings-section">
        <h3>
          {t(lang, "targetBloodSugar")} ({local.glucose_unit})
        </h3>
        <input
          type="number"
          step="0.1"
          min="0"
          value={local.target_blood_sugar}
          onChange={(e) =>
            setLocal({
              ...local,
              target_blood_sugar: Number.parseFloat(e.target.value),
            })
          }
        />
      </div>

      <div className="settings-section">
        <h3>{t(lang, "penIncrement")}</h3>
        <select
          value={local.pen_increment}
          onChange={(e) =>
            setLocal({
              ...local,
              pen_increment: Number.parseFloat(e.target.value) as 0.5 | 1,
            })
          }
        >
          <option value="0.5">0.5U</option>
          <option value="1">1U</option>
        </select>
      </div>

      <div className="settings-section">
        <h3>{t(lang, "insulin")}</h3>
        <label className="settings-hint" htmlFor="bolus-insulin">
          {t(lang, "bolusInsulin")}
        </label>
        <select
          id="bolus-insulin"
          value={local.bolus_insulin_id ?? ""}
          onChange={(e) => setBolusInsulin(e.target.value)}
        >
          <option value="">{t(lang, "selectInsulin")}</option>
          {bolusInsulinProfiles().map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand_name} ({p.generic_name})
            </option>
          ))}
        </select>

        {local.bolus_insulin_id && (
          <div className="insulin-bolus-group">
            <label className="settings-hint" htmlFor="insulin-action-minutes">
              {t(lang, "insulinActionDuration")}
            </label>
            <span className="settings-hint">
              {t(lang, "insulinActionDurationHint")}
            </span>
            <input
              id="insulin-action-minutes"
              type="number"
              min={MIN_DIA_MINUTES}
              max={MAX_DIA_MINUTES}
              step="15"
              value={local.insulin_action_minutes ?? ""}
              onChange={(e) =>
                setLocal({
                  ...local,
                  insulin_action_minutes: e.target.value
                    ? Number.parseInt(e.target.value, 10)
                    : null,
                })
              }
            />
            {diaOutOfRange && (
              <span className="settings-warning">{diaRangeMessage}</span>
            )}
            <figure className="iob-curve-figure">
              <div className="iob-curve-frame">
                {diaPlottable && bolusProfile && dia != null ? (
                  <IobCurve
                    peakMinutes={bolusProfile.action.peak_minutes}
                    durationMinutes={dia}
                    peakLabel={`${t(lang, "insulinPeak")} ${formatMinutes(
                      bolusProfile.action.peak_minutes,
                    )}`}
                  />
                ) : (
                  <p className="iob-curve-placeholder">{diaRangeMessage}</p>
                )}
              </div>
              <div className="iob-curve-legend">
                <span className="iob-legend iob-legend-activity">
                  {t(lang, "activityLegend")}
                </span>
                <span className="iob-legend iob-legend-iob">
                  {t(lang, "iobLegend")}
                </span>
              </div>
              <figcaption className="iob-curve-caption">
                {t(lang, "iobCurveCaption")}
              </figcaption>
              {bolusSources.length > 0 && (
                <div className="iob-curve-sources">
                  <span className="iob-curve-sources-label">
                    {t(lang, "iobCurveSources")}
                  </span>
                  <ul>
                    {bolusSources.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </figure>
          </div>
        )}

        <label className="settings-hint" htmlFor="basal-insulin">
          {t(lang, "basalInsulin")}
        </label>
        <select
          id="basal-insulin"
          value={local.basal_insulin_id ?? ""}
          onChange={(e) => setBasalInsulin(e.target.value)}
        >
          <option value="">{t(lang, "selectInsulin")}</option>
          {basalInsulinProfiles().map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand_name} ({p.generic_name})
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <h3>{t(lang, "glucoseUnit")}</h3>
        <select
          value={local.glucose_unit}
          onChange={(e) =>
            setLocal({
              ...local,
              glucose_unit: e.target.value as GlucoseUnit,
            })
          }
        >
          <option value="mg/dL">mg/dL</option>
          <option value="mmol/L">mmol/L</option>
        </select>
      </div>

      <div className="settings-section">
        <h3>{t(lang, "language")}</h3>
        <select
          value={local.language}
          onChange={(e) =>
            setLocal({
              ...local,
              language: e.target.value as "en" | "es",
            })
          }
        >
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </div>

      {error && <div className="error-box">{error}</div>}

      <button
        type="button"
        className="btn btn-primary"
        onClick={handleSave}
        disabled={saving}
      >
        {saved ? t(lang, "saved") : t(lang, "save")}
      </button>
    </div>
  );
}
