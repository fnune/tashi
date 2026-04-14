import type { CalculationResult, GlucoseUnit } from "@pincho/shared";
import * as api from "../api.js";
import { type Language, t } from "../i18n.js";
import { ResultTable } from "./ResultTable.js";

interface HistoryViewProps {
  history: CalculationResult[];
  lang: Language;
  glucoseUnit: GlucoseUnit;
  onRefresh: () => void;
  onReuse: (text: string) => void;
  expandedId?: string;
  onExpand: (id: string | undefined) => void;
}

export function HistoryView({
  history,
  lang,
  glucoseUnit,
  onRefresh,
  onReuse,
  expandedId,
  onExpand,
}: HistoryViewProps) {
  async function handleDelete(id: string) {
    await api.deleteHistoryEntry(id);
    if (expandedId === id) onExpand(undefined);
    onRefresh();
  }

  async function handleClear() {
    if (!window.confirm(t(lang, "confirmClear"))) return;
    await api.clearHistory();
    onExpand(undefined);
    onRefresh();
  }

  if (history.length === 0) {
    return <p>{t(lang, "noHistory")}</p>;
  }

  return (
    <div className="history-list">
      {history.map((entry) => (
        <div className="history-entry" key={entry.id}>
          <button
            type="button"
            className="history-entry-header"
            onClick={() =>
              onExpand(expandedId === entry.id ? undefined : entry.id)
            }
          >
            <span className="history-timestamp">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
            <span className="history-summary">{entry.input_text}</span>
            <span className="history-dose">
              {entry.correction
                ? `${entry.recommended_dose}U + ${entry.correction.correction_dose}U = ${entry.correction.total_dose}U`
                : `${entry.recommended_dose}U`}
            </span>
          </button>
          {expandedId === entry.id && (
            <div>
              <div style={{ padding: "8px 12px" }}>
                <ResultTable
                  result={entry}
                  lang={lang}
                  glucoseUnit={glucoseUnit}
                />
              </div>
              <div className="history-actions">
                <button
                  type="button"
                  className="btn btn-small btn-secondary"
                  onClick={() => onReuse(entry.input_text)}
                >
                  {t(lang, "reuseEntry")}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => handleDelete(entry.id)}
                >
                  {t(lang, "deleteEntry")}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn btn-danger" onClick={handleClear}>
        {t(lang, "clearHistory")}
      </button>
    </div>
  );
}
