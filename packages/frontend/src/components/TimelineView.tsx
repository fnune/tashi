import type {
  CreateTimelineRequest,
  GlucoseUnit,
  Settings,
  TimelineEntry,
  UpdateTimelineRequest,
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

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  const [error, setError] = useState<string | null>(null);

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

    setError(null);
    try {
      await api.createTimelineEntry(req);
      setValue("");
      setMode(null);
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add entry");
    }
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
            setError(null);
          }}
        >
          {t(lang, "back")}
        </button>
      </div>
      {error && <div className="error-box">{error}</div>}
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
  onUpdated,
}: {
  entry: TimelineEntry;
  lang: Language;
  glucoseUnit: GlucoseUnit;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdated: () => void;
}) {
  const [editTimestamp, setEditTimestamp] = useState(
    toLocalDatetime(entry.timestamp),
  );
  const [editValue, setEditValue] = useState(() => {
    if (entry.type === "fast_insulin" || entry.type === "slow_insulin")
      return String(entry.units);
    if (entry.type === "glucose_reading") return String(entry.value);
    return "";
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hasValueField = entry.type !== "meal";

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const timestamp = new Date(editTimestamp).toISOString();
    let updates: UpdateTimelineRequest;
    if (entry.type === "fast_insulin") {
      updates = {
        type: "fast_insulin",
        timestamp,
        units: Number.parseFloat(editValue),
      };
    } else if (entry.type === "slow_insulin") {
      updates = {
        type: "slow_insulin",
        timestamp,
        units: Number.parseFloat(editValue),
      };
    } else if (entry.type === "glucose_reading") {
      updates = {
        type: "glucose_reading",
        timestamp,
        value: Number.parseFloat(editValue),
      };
    } else {
      updates = { type: "meal", timestamp };
    }
    try {
      await api.updateTimelineEntry(entry.id, updates);
      onUpdated();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    editTimestamp !== toLocalDatetime(entry.timestamp) ||
    (hasValueField && editValue !== getOriginalValue());

  function getOriginalValue(): string {
    if (entry.type === "fast_insulin" || entry.type === "slow_insulin")
      return String(entry.units);
    if (entry.type === "glucose_reading") return String(entry.value);
    return "";
  }

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

  function valueLabel(): string {
    if (entry.type === "fast_insulin") return `${t(lang, "fastInsulin")} (U)`;
    if (entry.type === "slow_insulin") return `${t(lang, "slowInsulin")} (U)`;
    if (entry.type === "glucose_reading")
      return `${t(lang, "glucoseReading")} (${glucoseUnit})`;
    return "";
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
                  recommended_dose: entry.recommended_dose,
                  correction: entry.correction,
                }}
                lang={lang}
                glucoseUnit={glucoseUnit}
              />
            </div>
          )}
          <div className="entry-edit">
            <div className="input-group">
              <label htmlFor={`ts-${entry.id}`}>{t(lang, "dateTime")}</label>
              <input
                id={`ts-${entry.id}`}
                type="datetime-local"
                value={editTimestamp}
                onChange={(e) => setEditTimestamp(e.target.value)}
              />
            </div>
            {hasValueField && (
              <div className="input-group">
                <label htmlFor={`val-${entry.id}`}>{valueLabel()}</label>
                <input
                  id={`val-${entry.id}`}
                  type="number"
                  step="0.1"
                  min="0"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
            )}
          </div>
          {saveError && (
            <div className="error-box" style={{ margin: "0 12px" }}>
              {saveError}
            </div>
          )}
          <div className="history-actions">
            {dirty && (
              <button
                type="button"
                className="btn btn-small btn-primary"
                onClick={handleSave}
                disabled={saving}
              >
                {t(lang, "save")}
              </button>
            )}
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
    try {
      await api.deleteTimelineEntry(id);
      if (expandedId === id) onExpand(undefined);
      onRefresh();
    } catch (e) {
      console.error("Failed to delete entry:", e);
    }
  }

  async function handleClear() {
    if (!window.confirm(t(lang, "confirmClearTimeline"))) return;
    try {
      await api.clearTimeline();
      onExpand(undefined);
      onRefresh();
    } catch (e) {
      console.error("Failed to clear timeline:", e);
    }
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
          onUpdated={onRefresh}
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
