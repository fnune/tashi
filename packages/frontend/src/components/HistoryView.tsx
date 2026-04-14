import type { CalculationResult, GlucoseUnit } from "@pincho/shared";
import { useState } from "react";
import * as api from "../api.js";
import { type Language, t } from "../i18n.js";
import { ResultTable } from "./ResultTable.js";

interface HistoryViewProps {
  history: CalculationResult[];
  lang: Language;
  glucoseUnit: GlucoseUnit;
  onRefresh: () => void;
  onReuse: (text: string) => void;
}

export function HistoryView({
  history,
  lang,
  glucoseUnit,
  onRefresh,
  onReuse,
}: HistoryViewProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  async function handleDelete(id: string) {
    await api.deleteHistoryEntry(id);
    onRefresh();
  }

  async function handleClear() {
    await api.clearHistory();
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
            onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
          >
            <span className="history-timestamp">
              {new Date(entry.timestamp).toLocaleString()}
            </span>
            <span className="history-summary">{entry.input_text}</span>
            <span className="history-dose">{entry.recommended_dose}U</span>
          </button>
          {expanded === entry.id && (
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
