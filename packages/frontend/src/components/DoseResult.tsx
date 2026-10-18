import type {
  CalculatedItem,
  CalculationResult,
  RatioFormat,
} from "@tashi/shared";
import { NORMAL_PROFILE_ID } from "@tashi/shared";
import { useState } from "react";
import { Link } from "react-router";
import { type Language, type TranslationKey, t } from "../i18n.js";
import { profileName, signedPercent } from "../profileLabels.js";
import { formatRatio } from "../ratioLabels.js";
import { parseDecimal } from "./ui/Field.js";
import "./DoseResult.css";

export type MealResult = Omit<CalculationResult, "recommended_dose"> & {
  recommended_dose?: number;
};

const FAT_PROTEIN_REASON: Record<string, TranslationKey> = {
  high_fat: "highFat",
  fat_and_protein: "fatAndProtein",
  energy_ratio: "energyRatio",
};

const LOW_GI_MAX = 55;
const HIGH_GI_MIN = 70;
const SHOWN_ROUNDING = 0.05;

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
    result.recommended_dose
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
  penIncrement: number,
): DoseLine[] {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
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
        label: t(lang, "activeInsulin"),
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
      label: t(lang, "doseProfile").replace(
        "{name}",
        profileName(profile, lang),
      ),
      detail: signedPercent(profile.percent),
      units: scaled - sum,
    });
    sum = scaled;
  }

  const total = totalDose(result);
  if (total !== undefined && Math.abs(total - sum) >= SHOWN_ROUNDING) {
    lines.push({
      key: "rounding",
      label: t(lang, "doseRounding"),
      detail: t(lang, "doseRoundingDetail").replace(
        "{pen}",
        decimal.format(penIncrement),
      ),
      units: total - sum,
    });
  }
  return lines;
}

export function DoseSummary({
  result,
  lang,
  ratioFormat,
  penIncrement,
  showDisclaimer = true,
}: {
  result: MealResult;
  lang: Language;
  ratioFormat: RatioFormat;
  penIncrement: number;
  showDisclaimer?: boolean;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const total = totalDose(result);
  const signed = (units: number) =>
    `${units >= 0 ? "+" : "−"}${decimal.format(Math.abs(units))} U`;

  return (
    <section className="dose">
      <p className="dose-caption">
        {t(lang, "suggestedDoseFor").replace(
          "{window}",
          result.meal_window.name,
        )}
      </p>
      <div className="dose-total">
        <b className="num">
          {total === undefined ? "—" : decimal.format(total)}
        </b>
        <span>U</span>
      </div>
      <dl className="dose-parts">
        {doseLines(result, lang, ratioFormat, penIncrement).map((line) => (
          <div key={line.key} data-part={line.key}>
            <dt>
              {line.label}
              {line.detail && <small>{line.detail}</small>}
            </dt>
            <dd className="num">{signed(line.units)}</dd>
          </div>
        ))}
      </dl>
      {showDisclaimer && (
        <p className="dose-disclaimer">{t(lang, "doseIsYourCall")}</p>
      )}
      <Link to="/dose-explained" className="dose-why">
        {t(lang, "fatProteinLearnMore")}
      </Link>
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
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
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
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
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
