import type {
  CalculatedItem,
  CalculationResult,
  GlucoseUnit,
} from "@pincho/shared";
import { Link } from "react-router";
import { type Language, type TranslationKey, t } from "../i18n.js";

const THRESHOLD_I18N: Record<string, TranslationKey> = {
  high_fat: "highFat",
  fat_and_protein: "fatAndProtein",
  energy_ratio: "energyRatio",
};

interface ResultTableProps {
  result: Omit<CalculationResult, "recommended_dose"> & {
    recommended_dose?: number;
  };
  lang: Language;
  glucoseUnit: GlucoseUnit;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sourceLink(item: CalculatedItem): {
  label: string;
  url: string | null;
} {
  if (!item.food_item) {
    if (item.estimated) return { label: "LLM", url: null };
    return { label: "?", url: null };
  }
  const { data_type, fdc_id } = item.food_item;
  if (data_type === "curated") {
    return {
      label: "BEDCA",
      url: "https://www.bedca.net/bdpub/index.php",
    };
  }
  return {
    label: "USDA",
    url: `https://fdc.nal.usda.gov/food-details/${fdc_id}/nutrients`,
  };
}

const LOW_GI_MAX = 55;
const HIGH_GI_MIN = 70;

function giBand(gi: number): "low" | "medium" | "high" {
  if (gi <= LOW_GI_MAX) return "low";
  if (gi < HIGH_GI_MIN) return "medium";
  return "high";
}

function DoseDisplay({
  result,
  lang,
  glucoseUnit,
}: {
  result: ResultTableProps["result"];
  lang: Language;
  glucoseUnit: GlucoseUnit;
}) {
  const dose = result.recommended_dose;
  if (dose == null) {
    return (
      <div className="result-dose">
        <span className="dose-line faded">--</span>
      </div>
    );
  }

  const corr = result.correction;
  const fp = result.fat_protein_adjustment;
  const hasCorr = corr !== undefined;
  const hasFp = fp !== undefined;

  const grandTotal = fp?.total_dose ?? corr?.total_dose ?? dose;
  const parts: string[] = [`${dose}U`];
  if (hasCorr) parts.push(`${corr.correction_dose}U`);
  if (hasFp) parts.push(`${fp.adjustment_dose}U`);

  const showFormula = parts.length > 1;

  const details: string[] = [];
  details.push(`${t(lang, "recommendedDose")}: ${dose}U`);
  if (hasCorr) {
    let corrText = `${t(lang, "correction")}: ${corr.current_blood_sugar} → ${corr.target_blood_sugar} ${glucoseUnit} (${corr.correction_dose >= 0 ? "+" : ""}${corr.correction_dose}U)`;
    if (corr.iob_reduction > 0) {
      corrText += ` - ${t(lang, "insulinOnBoard")} ${corr.iob}U (-${corr.iob_reduction}U)`;
    }
    details.push(corrText);
  }

  const thresholdKey = fp ? THRESHOLD_I18N[fp.threshold_met] : undefined;

  return (
    <div className="result-dose">
      <span className="dose-line">
        {showFormula ? `${parts.join(" + ")} = ${grandTotal}U` : `${dose}U`}
      </span>
      {(hasCorr || hasFp) && (
        <span className="dose-detail">
          {details.join(" | ")}
          {hasFp && (
            <>
              {details.length > 0 && " | "}
              {t(lang, "fatProteinAdjustment")}: +
              {Math.round(fp.multiplier * 100)}% (+{fp.adjustment_dose}U)
              {thresholdKey && ` [${t(lang, thresholdKey)}]`}{" "}
              <Link to="/fat-protein-info" className="fp-learn-more">
                {t(lang, "fatProteinLearnMore")}
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}

export function ResultTable({ result, lang, glucoseUnit }: ResultTableProps) {
  const time = formatTime(new Date(result.timestamp));

  return (
    <div className="result">
      <div className="result-header">
        <span>
          {time} — {result.meal_window.name} — 1U : {result.meal_window.ratio}g
        </span>
      </div>
      <table className="result-table">
        <thead>
          <tr>
            <th>{t(lang, "item")}</th>
            <th className="num">GI</th>
            <th className="num">{t(lang, "grams")}</th>
            <th className="num">{t(lang, "carbsPer100g")}</th>
            <th className="num">{t(lang, "netCarbs")}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item, i) => {
            const per100g = item.net_carbs_per_100g;
            const source = sourceLink(item);
            const gi = item.glycemic_index;
            const giIsEstimated = item.gi_estimated;

            return (
              <tr
                key={`${item.description}-${i}`}
                className={item.warning ? "warning-row" : ""}
              >
                <td>
                  {item.description}
                  {source.label && (
                    <>
                      {" "}
                      {source.url ? (
                        <a
                          className="source-link"
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={source.label}
                        >
                          {source.label}
                        </a>
                      ) : (
                        <span
                          className={`source-link${source.label === "?" ? " source-unknown" : ""}`}
                          title={
                            source.label === "?"
                              ? "Unknown data source"
                              : source.label
                          }
                        >
                          {source.label}
                        </span>
                      )}
                    </>
                  )}
                  {item.estimated && (
                    <span className="estimated-badge">
                      {t(lang, "estimated")}
                    </span>
                  )}
                  {item.notes && (
                    <span className="note-text">{item.notes}</span>
                  )}
                  {item.warning && (
                    <span className="warning-text">{item.warning}</span>
                  )}
                </td>
                <td className="num" data-label="GI">
                  {gi != null ? (
                    <span
                      className={`gi-badge gi-badge-${giBand(gi)}${giIsEstimated ? " gi-badge-estimated" : ""}`}
                      title={
                        giIsEstimated
                          ? t(lang, "giEstimated")
                          : (item.food_item?.gi_source ?? undefined)
                      }
                    >
                      {giIsEstimated ? "~" : ""}
                      {gi}
                    </span>
                  ) : (
                    <span className="faded">--</span>
                  )}
                </td>
                <td className="num" data-label={t(lang, "grams")}>
                  {item.weight_g}g
                </td>
                <td className="num faded" data-label={t(lang, "carbsPer100g")}>
                  {per100g}g
                </td>
                <td className="num" data-label={t(lang, "netCarbs")}>
                  {item.net_carbs_g}g
                </td>
              </tr>
            );
          })}
          <tr className="result-total">
            <td>{t(lang, "totalNetCarbs")}</td>
            <td className="hide-mobile" />
            <td className="hide-mobile" />
            <td className="hide-mobile" />
            <td className="num">{result.total_net_carbs_g}g</td>
          </tr>
        </tbody>
      </table>

      <DoseDisplay result={result} lang={lang} glucoseUnit={glucoseUnit} />
    </div>
  );
}
