import type {
  CalculatedItem,
  CalculationResult,
  RatioFormat,
} from "@tashi/shared";
import { NORMAL_PROFILE_ID } from "@tashi/shared";
import { useState } from "react";
import { Link } from "react-router";
import { type Language, type TranslationKey, t } from "../i18n.js";
import { signedPercent } from "../profileLabels.js";
import { formatRatio } from "../ratioLabels.js";
import { parseDecimal } from "./ui/Field.js";
import { Stepper } from "./ui/Stepper.js";
import "./DoseResult.css";
import { numberFormat } from "../numberFormat.js";

export type MealResult = Omit<CalculationResult, "carb_dose"> & {
  carb_dose?: number;
};

const FAT_PROTEIN_REASON: Record<string, TranslationKey> = {
  high_fat: "highFat",
  fat_and_protein: "fatAndProtein",
  energy_ratio: "energyRatio",
};

const LOW_GI_MAX = 55;
const HIGH_GI_MIN = 70;

function giBand(gi: number): "low" | "medium" | "high" {
  if (gi <= LOW_GI_MAX) return "low";
  if (gi < HIGH_GI_MIN) return "medium";
  return "high";
}

function sourceOf(item: CalculatedItem): { label: string; url: string | null } {
  if (!item.food_item) {
    return { label: item.estimated ? "LLM" : "?", url: null };
  }
  const { data_type, fdc_id } = item.food_item;
  if (data_type === "curated") {
    return { label: "BEDCA", url: "https://www.bedca.net/bdpub/index.php" };
  }
  return {
    label: "USDA",
    url: `https://fdc.nal.usda.gov/food-details/${fdc_id}/nutrients`,
  };
}

export function totalDose(result: MealResult): number | undefined {
  return (
    result.total_dose ??
    result.fat_protein_adjustment?.total_dose ??
    result.correction?.total_dose ??
    result.carb_dose
  );
}

interface DoseLine {
  key: string;
  label: string;
  detail?: string;
  units: number;
}

function doseLines(
  result: MealResult,
  lang: Language,
  ratioFormat: RatioFormat,
): DoseLine[] {
  const decimal = numberFormat(lang);
  const ratio = result.meal_window.ratio;
  const carbs = result.total_net_carbs_g / ratio;
  const lines: DoseLine[] = [
    {
      key: "carbs",
      label: t(lang, "doseCarbs"),
      detail: `${decimal.format(result.total_net_carbs_g)} g ÷ ${formatRatio(ratio, ratioFormat, lang)}`,
      units: carbs,
    },
  ];
  let sum = carbs;

  const correction = result.correction;
  if (correction) {
    const beforeIob = correction.correction_dose + correction.iob_reduction;
    lines.push({
      key: "correction",
      label: t(lang, "correction"),
      detail: `(${decimal.format(correction.current_blood_sugar)} − ${decimal.format(correction.target_blood_sugar)}) ÷ ${decimal.format(correction.correction_factor)}`,
      units: beforeIob,
    });
    if (correction.iob_reduction > 0) {
      lines.push({
        key: "iob",
        label: t(lang, "doseIob"),
        detail: t(lang, "doseIobDetail"),
        units: -correction.iob_reduction,
      });
    }
    sum += correction.correction_dose;
  }

  const fatProtein = result.fat_protein_adjustment;
  if (fatProtein) {
    const reason = FAT_PROTEIN_REASON[fatProtein.threshold_met];
    lines.push({
      key: "fatProtein",
      label: t(lang, "doseFatProtein"),
      ...(reason ? { detail: t(lang, reason) } : {}),
      units: fatProtein.adjustment_dose,
    });
    sum += fatProtein.adjustment_dose;
  }

  const profile = result.profile;
  if (profile && profile.id !== NORMAL_PROFILE_ID && profile.percent) {
    const scaled = sum * (1 + profile.percent / 100);
    lines.push({
      key: "profile",
      label: t(lang, "doseProfile"),
      detail: signedPercent(profile.percent),
      units: scaled - sum,
    });
    sum = scaled;
  }

  return lines;
}

export function DoseSummary({
  result,
  lang,
  ratioFormat,
  penIncrement,
  units,
  onUnitsChange,
}: {
  result: MealResult;
  lang: Language;
  ratioFormat: RatioFormat;
  penIncrement: number;
  units?: number;
  onUnitsChange?: (units: number) => void;
}) {
  const decimal = numberFormat(lang);
  const total = totalDose(result);
  const lines = doseLines(result, lang, ratioFormat);
  const measured = lines.filter((line) => Number.isFinite(line.units));
  const added = measured.reduce(
    (sum, line) => sum + Math.max(line.units, 0),
    0,
  );
  const removed = measured.reduce(
    (sum, line) => sum + Math.max(-line.units, 0),
    0,
  );
  const share = (units: number) => `${(Math.abs(units) / added) * 100}%`;
  const signed = (units: number, first: boolean) => {
    if (!Number.isFinite(units)) return decimal.format(units);
    const sign = units < 0 ? "−" : first ? "" : "+";
    return `${sign}${decimal.format(Math.abs(units))}`;
  };

  return (
    <section className="dose">
      <header className="dose-head">
        <p className="dose-caption">
          {t(lang, "suggestedDoseFor").replace(
            "{window}",
            result.meal_window.name,
          )}
        </p>
        <Link to="/dose-explained" className="dose-why">
          {t(lang, "fatProteinLearnMore")}
        </Link>
      </header>
      <div className="dose-total">
        {units !== undefined && onUnitsChange ? (
          <Stepper
            value={units}
            step={penIncrement}
            unit="U"
            format={(v) => decimal.format(v)}
            decreaseLabel={t(lang, "lessInsulin").replace(
              "{step}",
              decimal.format(penIncrement),
            )}
            increaseLabel={t(lang, "moreInsulin").replace(
              "{step}",
              decimal.format(penIncrement),
            )}
            onChange={onUnitsChange}
          />
        ) : (
          <p>
            <b className="num">
              {total === undefined ? "—" : decimal.format(total)}
            </b>{" "}
            <small>U</small>
          </p>
        )}
        {units !== undefined &&
          onUnitsChange &&
          total !== undefined &&
          units !== total && (
            <button
              type="button"
              className="dose-reset"
              onClick={() => onUnitsChange(total)}
            >
              {t(lang, "backToSuggested").replace(
                "{units}",
                decimal.format(total),
              )}
            </button>
          )}
      </div>
      {added > 0 && (
        <div className="dose-bar" aria-hidden="true">
          {measured
            .filter((line) => line.units > 0)
            .map((line) => (
              <span
                key={line.key}
                data-part={line.key}
                style={{ flexBasis: share(line.units) }}
              />
            ))}
          {removed > 0 && (
            <span
              className="dose-bar-removed"
              style={{ width: share(removed) }}
            />
          )}
        </div>
      )}
      <dl className="dose-parts">
        {lines.map((line, i) => (
          <div
            key={line.key}
            data-part={line.key}
            data-removed={line.units < 0 || undefined}
          >
            <dt title={line.detail}>{line.label}</dt>
            <dd className="num">{signed(line.units, i === 0)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FoodRow({
  item,
  lang,
  onWeightChange,
}: {
  item: CalculatedItem;
  lang: Language;
  onWeightChange?: (weight: number) => void;
}) {
  const decimal = numberFormat(lang);
  const [weightText, setWeightText] = useState(decimal.format(item.weight_g));
  const source = sourceOf(item);
  const gi = item.glycemic_index;

  return (
    <li className="food" data-warning={item.warning ? "" : undefined}>
      <div className="food-name">
        {item.description}
        {gi != null && (
          <span
            className={`gi-badge gi-badge-${giBand(gi)}${item.gi_estimated ? " gi-badge-estimated" : ""}`}
            title={
              item.gi_estimated
                ? t(lang, "giEstimated")
                : (item.food_item?.gi_source ?? undefined)
            }
          >
            IG {item.gi_estimated ? "~" : ""}
            {gi}
          </span>
        )}
        {source.url ? (
          <a
            className="source-link"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.label}
          </a>
        ) : (
          <span
            className={`source-link${source.label === "?" ? " source-unknown" : ""}`}
          >
            {source.label}
          </span>
        )}
        {item.estimated && (
          <span className="estimated-badge">{t(lang, "estimated")}</span>
        )}
      </div>
      <div className="food-detail">
        {onWeightChange ? (
          <label className="food-weight">
            <input
              inputMode="decimal"
              autoComplete="off"
              aria-label={t(lang, "foodWeightLabel").replace(
                "{food}",
                item.description,
              )}
              value={weightText}
              onChange={(e) => {
                setWeightText(e.target.value);
                const weight = parseDecimal(e.target.value);
                if (weight !== null && weight >= 0) onWeightChange(weight);
              }}
            />
            g
          </label>
        ) : (
          <span className="num">{decimal.format(item.weight_g)}&nbsp;g</span>
        )}
        <span>
          {" · "}
          {decimal.format(item.net_carbs_per_100g)}&nbsp;g/100&nbsp;g
        </span>
      </div>
      {item.notes && <div className="food-note">{item.notes}</div>}
      {item.warning && <div className="food-warning">{item.warning}</div>}
      <div className="food-carbs">
        <b className="num">{decimal.format(item.net_carbs_g)}&nbsp;g</b>
        <small>{t(lang, "carbsShort")}</small>
      </div>
    </li>
  );
}

export function FoodList({
  result,
  lang,
  onWeightChange,
}: {
  result: MealResult;
  lang: Language;
  onWeightChange?: (index: number, weight: number) => void;
}) {
  const decimal = numberFormat(lang);
  return (
    <section className="breakdown">
      <h3 className="section-heading">{t(lang, "foodsTitle")}</h3>
      <ul className="foods">
        {result.items.map((item, i) => (
          <FoodRow
            key={`${item.description}-${i}`}
            item={item}
            lang={lang}
            {...(onWeightChange
              ? {
                  onWeightChange: (weight: number) => onWeightChange(i, weight),
                }
              : {})}
          />
        ))}
      </ul>
      <div className="breakdown-total">
        <span>{t(lang, "netCarbsTotal")}</span>
        <span className="num">
          {decimal.format(result.total_net_carbs_g)}&nbsp;g
        </span>
      </div>
    </section>
  );
}
