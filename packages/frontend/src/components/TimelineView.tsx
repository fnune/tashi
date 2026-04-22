import type {
  CreateTimelineRequest,
  GlucoseUnit,
  Settings,
  TimelineEntry,
} from "@pincho/shared";
import { useState } from "react";
import * as api from "../api.js";
import { type Language, t } from "../i18n.js";
import { ResultTable } from "./ResultTable.js";

interface TimelineViewProps {
  timeline: TimelineEntry[];
  settings: Settings;
  lang: Language;
  onRefresh: () => void;
  expandedId?: string;
  onExpand: (id: string | undefined) => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function QuickAdd({
  lang,
  glucoseUnit,
  onAdded,
}: {
  lang: Language;
  glucoseUnit: GlucoseUnit;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<
    "fast_insulin" | "slow_insulin" | "glucose_reading" | null
  >(null);
  const [value, setValue] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode || !value) return;

    const num = Number.parseFloat(value);
    if (Number.isNaN(num) || num <= 0) return;

    let req: CreateTimelineRequest;
    if (mode === "glucose_reading") {
      req = { type: "glucose_reading", value: num, unit: glucoseUnit };
    } else {
      req = { type: mode, units: num };
    }

    await api.createTimelineEntry(req);
    setValue("");
    setMode(null);
    onAdded();
  }

  if (!mode) {
    return (
      <div className="quick-add-buttons">
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={() => setMode("fast_insulin")}
        >
          + {t(lang, "fastInsulin")}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={() => setMode("slow_insulin")}
        >
          + {t(lang, "slowInsulin")}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={() => setMode("glucose_reading")}
        >
          + {t(lang, "glucoseReading")}
        </button>
      </div>
    );
  }

  const label =
    mode === "glucose_reading"
      ? `${t(lang, "glucoseReading")} (${glucoseUnit})`
      : `${t(lang, mode === "fast_insulin" ? "fastInsulin" : "slowInsulin")} (U)`;

  return (
    <form className="quick-add-form" onSubmit={handleSubmit}>
      <label htmlFor="quick-add-value">{label}</label>
      <div className="quick-add-row">
        <input
          id="quick-add-value"
          type="number"
          step="0.1"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn btn-small btn-primary">
          {t(lang, "addEntry")}
        </button>
        <button
          type="button"
          className="btn btn-small btn-secondary"
          onClick={() => {
            setMode(null);
            setValue("");
          }}
        >
          {t(lang, "back")}
        </button>
      </div>
    </form>
  );
}

function EntryCard({
  entry,
  lang,
  glucoseUnit,
  expanded,
  onToggle,
  onDelete,
}: {
  entry: TimelineEntry;
  lang: Language;
  glucoseUnit: GlucoseUnit;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  function renderSummary() {
    switch (entry.type) {
      case "meal":
        return <span className="history-summary">{entry.input_text}</span>;
      case "fast_insulin":
        return (
          <span className="history-summary">
            {t(lang, "fastInsulin")}: {entry.units}U
          </span>
        );
      case "slow_insulin":
        return (
          <span className="history-summary">
            {t(lang, "slowInsulin")}: {entry.units}U
          </span>
        );
      case "glucose_reading":
        return (
          <span className="history-summary">
            {t(lang, "glucoseReading")}: {entry.value} {entry.unit}
          </span>
        );
    }
  }

  function renderBadge() {
    switch (entry.type) {
      case "meal":
        return <span className="entry-badge entry-badge-meal">🍽</span>;
      case "fast_insulin":
        return <span className="entry-badge entry-badge-fast">⚡</span>;
      case "slow_insulin":
        return <span className="entry-badge entry-badge-slow">💉</span>;
      case "glucose_reading":
        return <span className="entry-badge entry-badge-glucose">🩸</span>;
    }
  }

  return (
    <div className="history-entry">
      <button type="button" className="history-entry-header" onClick={onToggle}>
        {renderBadge()}
        <span className="history-timestamp">{formatTime(entry.timestamp)}</span>
        {renderSummary()}
      </button>
      {expanded && (
        <div>
          {entry.type === "meal" && (
            <div style={{ padding: "8px 12px" }}>
              <ResultTable
                result={{
                  id: entry.id,
                  timestamp: entry.timestamp,
                  input_text: entry.input_text,
                  language: entry.language,
                  meal_window: entry.meal_window,
                  items: entry.items,
                  total_net_carbs_g: entry.total_net_carbs_g,
                  recommended_dose: 0,
                }}
                lang={lang}
                glucoseUnit={glucoseUnit}
              />
            </div>
          )}
          <div className="history-actions">
            <button
              type="button"
              className="btn btn-small btn-danger"
              onClick={onDelete}
            >
              {t(lang, "deleteEntry")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TimelineView({
  timeline,
  settings,
  lang,
  onRefresh,
  expandedId,
  onExpand,
}: TimelineViewProps) {
  async function handleDelete(id: string) {
    await api.deleteTimelineEntry(id);
    if (expandedId === id) onExpand(undefined);
    onRefresh();
  }

  async function handleClear() {
    if (!window.confirm(t(lang, "confirmClearTimeline"))) return;
    await api.clearTimeline();
    onExpand(undefined);
    onRefresh();
  }

  return (
    <div className="history-list">
      <QuickAdd
        lang={lang}
        glucoseUnit={settings.glucose_unit}
        onAdded={onRefresh}
      />

      {timeline.length === 0 && <p>{t(lang, "noTimeline")}</p>}

      {timeline.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          lang={lang}
          glucoseUnit={settings.glucose_unit}
          expanded={expandedId === entry.id}
          onToggle={() =>
            onExpand(expandedId === entry.id ? undefined : entry.id)
          }
          onDelete={() => handleDelete(entry.id)}
        />
      ))}

      {timeline.length > 0 && (
        <button type="button" className="btn btn-danger" onClick={handleClear}>
          {t(lang, "clearTimeline")}
        </button>
      )}
    </div>
  );
}
