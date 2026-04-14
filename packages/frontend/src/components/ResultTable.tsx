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
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sourceLink(item: CalculatedItem): {
  label: string;
  url: string | null;
  fibreSubtracted: boolean;
} {
  if (!item.food_item) {
    if (item.estimated)
      return { label: "LLM", url: null, fibreSubtracted: false };
    return { label: "", url: null, fibreSubtracted: false };
  }
  const { data_source, data_source_id, carbs_include_fibre } = item.food_item;
  if (data_source === "USDA FoodData Central") {
    return {
      label: "USDA",
      url: `https://fdc.nal.usda.gov/food-details/${data_source_id}/nutrients`,
      fibreSubtracted: carbs_include_fibre,
    };
  }
  if (data_source === "BEDCA") {
    return {
      label: "BEDCA",
      url: "https://www.bedca.net/bdpub/index.php",
      fibreSubtracted: carbs_include_fibre,
    };
  }
  return {
    label: data_source,
    url: null,
    fibreSubtracted: carbs_include_fibre,
  };
}

function giColor(gi: number): string {
  const clamped = Math.min(Math.max(0, gi), 100) / 100;
  const hue = 120 * (1 - clamped);
  return `hsl(${hue}, 70%, 40%)`;
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
            const per100g =
              item.weight_g > 0
                ? Math.round((item.net_carbs_g / item.weight_g) * 1000) / 10
                : 0;
            const source = sourceLink(item);
            const gi = item.food_item?.glycemic_index;

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
                          title={
                            source.fibreSubtracted
                              ? `${source.label}: fibre subtracted from source carbs`
                              : source.label
                          }
                        >
                          {source.label}
                          {source.fibreSubtracted && " -f"}
                        </a>
                      ) : (
                        <span className="source-link">{source.label}</span>
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
                <td className="num">
                  {gi != null ? (
                    <span
                      className="gi-badge"
                      style={{ background: giColor(gi) }}
                      title={item.food_item?.gi_source ?? undefined}
                    >
                      {gi}
                    </span>
                  ) : (
                    <span className="faded">--</span>
                  )}
                </td>
                <td className="num">{item.weight_g}g</td>
                <td className="num faded">{per100g}g</td>
                <td className="num">{item.net_carbs_g}g</td>
              </tr>
            );
          })}
          <tr className="result-total">
            <td>{t(lang, "totalNetCarbs")}</td>
            <td />
            <td />
            <td />
            <td className="num">{result.total_net_carbs_g}g</td>
          </tr>
        </tbody>
      </table>

      <div className="result-dose">
        {result.correction ? (
          <>
            <span className="dose-line">
              {result.recommended_dose}U + {result.correction.correction_dose}U
              = {result.correction.total_dose}U
            </span>
            <span className="dose-detail">
              {t(lang, "recommendedDose")}: {result.recommended_dose}U |{" "}
              {t(lang, "correction")}: {result.correction.current_blood_sugar} →{" "}
              {result.correction.target_blood_sugar} {glucoseUnit} (+
              {result.correction.correction_dose}U)
            </span>
          </>
        ) : (
          <span className="dose-line">{result.recommended_dose}U</span>
        )}
      </div>
    </div>
  );
}
