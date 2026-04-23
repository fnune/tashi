import type {
  CalculatedItem,
  CalculationResult,
  GlucoseUnit,
} from "@pincho/shared";
import { type Language, t } from "../i18n.js";

interface ResultTableProps {
  result: CalculationResult;
  lang: Language;
  glucoseUnit: GlucoseUnit;
  hideDose?: boolean;
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

function giColor(gi: number): string {
  const clamped = Math.min(Math.max(0, gi), 100) / 100;
  const hue = 120 * (1 - clamped);
  return `hsl(${hue}, 70%, 40%)`;
}

export function ResultTable({ result, lang, glucoseUnit, hideDose }: ResultTableProps) {
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
            const per100g =
              item.weight_g > 0
                ? Math.round((item.net_carbs_g / item.weight_g) * 1000) / 10
                : 0;
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
                      className="gi-badge"
                      style={{
                        background: giColor(gi),
                        ...(giIsEstimated
                          ? {
                              borderStyle: "dashed",
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.6)",
                            }
                          : {}),
                      }}
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

      {!hideDose && (
        <div className="result-dose">
          {result.correction ? (
            <>
              <span className="dose-line">
                {result.recommended_dose}U + {result.correction.correction_dose}U
                = {result.correction.total_dose}U
              </span>
              <span className="dose-detail">
                {t(lang, "recommendedDose")}: {result.recommended_dose}U |{" "}
                {t(lang, "correction")}: {result.correction.current_blood_sugar}{" "}
                → {result.correction.target_blood_sugar} {glucoseUnit} (+
                {result.correction.correction_dose}U)
              </span>
            </>
          ) : (
            <span className="dose-line">{result.recommended_dose}U</span>
          )}
        </div>
      )}
    </div>
  );
}
