import type { CalculationResult } from "@t1d-aid/shared";
import { type Language, t } from "../i18n.js";

interface ResultTableProps {
  result: CalculationResult;
  lang: Language;
}

export function ResultTable({ result, lang }: ResultTableProps) {
  const sources = [
    ...new Set(
      result.items.map((i) => i.data_source).filter((s) => s !== "unknown"),
    ),
  ];

  return (
    <div className="result">
      <div className="result-header">
        <span>
          {result.meal_window.name} | 1U : {result.meal_window.ratio}g
        </span>
        <span className="source-text">{sources.join(", ")}</span>
      </div>
      <table className="result-table">
        <thead>
          <tr>
            <th>{t(lang, "item")}</th>
            <th className="num">{t(lang, "amount")}</th>
            <th className="num">{t(lang, "netCarbs")}</th>
          </tr>
        </thead>
        <tbody>
          {result.items.map((item, i) => (
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
                {item.notes && <span className="note-text">{item.notes}</span>}
                {item.warning && (
                  <span className="warning-text">{item.warning}</span>
                )}
              </td>
              <td className="num">{item.weight_g}g</td>
              <td className="num">{item.net_carbs_g}g</td>
            </tr>
          ))}
          <tr className="result-total">
            <td>{t(lang, "totalNetCarbs")}</td>
            <td />
            <td className="num">{result.total_net_carbs_g}g</td>
          </tr>
        </tbody>
      </table>

      {result.correction && (
        <div className="correction-box">
          {t(lang, "correction")}: {result.correction.current_blood_sugar}{" "}
          mmol/L → {result.correction.target_blood_sugar} mmol/L | +
          {result.correction.correction_dose}U
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
    </div>
  );
}
