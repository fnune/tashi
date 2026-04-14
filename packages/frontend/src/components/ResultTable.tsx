import type { CalculationResult, GlucoseUnit } from "@pincho/shared";
import { type Language, t } from "../i18n.js";

interface ResultTableProps {
  result: CalculationResult;
  lang: Language;
  glucoseUnit: GlucoseUnit;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ResultTable({ result, lang, glucoseUnit }: ResultTableProps) {
  const sources = [
    ...new Set(
      result.items.map((i) => i.data_source).filter((s) => s !== "unknown"),
    ),
  ];

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
            <th className="num">{t(lang, "amount")}</th>
            <th className="num">/100g</th>
            <th className="num">{t(lang, "netCarbs")}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item, i) => {
            const per100g =
              item.weight_g > 0
                ? Math.round((item.net_carbs_g / item.weight_g) * 1000) / 10
                : 0;

            return (
              <tr
                key={`${item.description}-${i}`}
                className={item.warning ? "warning-row" : ""}
              >
                <td>
                  {item.description}
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
            <td className="num">{result.total_net_carbs_g}g</td>
          </tr>
        </tbody>
      </table>

      {result.correction && (
        <div className="correction-box">
          {t(lang, "correction")}: {result.correction.current_blood_sugar}{" "}
          {glucoseUnit} → {result.correction.target_blood_sugar} {glucoseUnit} |
          +{result.correction.correction_dose}U
          <br />
          {t(lang, "totalDose")}: {result.correction.total_dose}U
        </div>
      )}

      <div className="result-dose">
        {t(lang, "recommendedDose")}: {result.recommended_dose}U
        {result.correction && (
          <span>
            {" "}
            ({t(lang, "totalDose")}: {result.correction.total_dose}U)
          </span>
        )}
      </div>

      <div className="result-sources">{sources.join(", ")}</div>
    </div>
  );
}
