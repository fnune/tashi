import type {
  GlucoseEntry,
  GlucoseRange,
  InsulinOnBoard,
  Settings,
} from "@pincho/shared";
import { correctionComponents, glucoseRange } from "@pincho/shared";
import { useState } from "react";
import type { Language, TranslationKey } from "../i18n.js";
import { t } from "../i18n.js";
import { Button } from "./ui/Button.js";
import { NumberField, parseDecimal } from "./ui/Field.js";
import { Sheet } from "./ui/Sheet.js";
import "./SensorCard.css";

const RANGE_LABEL: Record<GlucoseRange, TranslationKey> = {
  low: "glucoseLow",
  in_range: "inRange",
  high: "glucoseHigh",
};

const VISIBLE_IOB_UNITS = 0.05;

function clockTime(date: Date, lang: Language): string {
  return date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
}

function iobRunOut(iob: InsulinOnBoard, actionMinutes: number): Date | null {
  const ends = iob.contributions
    .filter((c) => c.units_remaining > 0)
    .map((c) => new Date(c.injected_at).getTime() + actionMinutes * 60_000);
  return ends.length ? new Date(Math.max(...ends)) : null;
}

export function SensorCard({
  settings,
  lang,
  reading,
  iob,
  onSaveReading,
}: {
  settings: Settings;
  lang: Language;
  reading: GlucoseEntry | null;
  iob: InsulinOnBoard | null;
  onSaveReading: (value: number) => Promise<void>;
}) {
  const [measuring, setMeasuring] = useState(false);
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const unit = settings.glucose_unit;
  const range = reading ? glucoseRange(reading.value, unit) : null;
  const minutesAgo = reading
    ? Math.floor((Date.now() - new Date(reading.timestamp).getTime()) / 60_000)
    : null;

  const iobUnits = iob?.total_units ?? 0;
  const hasIob = iobUnits >= VISIBLE_IOB_UNITS;
  const injectedUnits =
    iob?.contributions.reduce((sum, c) => sum + c.units, 0) ?? 0;
  const runOut =
    iob && hasIob && settings.insulin_action_minutes
      ? iobRunOut(iob, settings.insulin_action_minutes)
      : null;

  return (
    <section className="sensor">
      <button
        type="button"
        className="dial"
        data-range={range ?? "none"}
        onClick={() => setMeasuring(true)}
        aria-label={t(lang, "currentGlucose")}
      >
        <span className="dial-value">
          {reading ? decimal.format(reading.value) : "—"}
        </span>
        <span className="dial-unit">{unit}</span>
        <span className="dial-action">✎ {t(lang, "measure")}</span>
      </button>

      <div className="sensor-meta">
        <span className="sensor-state" data-range={range ?? "none"}>
          {range ? `● ${t(lang, RANGE_LABEL[range])}` : t(lang, "noReading")}
        </span>

        <div className="sensor-stat">
          <div className="sensor-stat-row">
            <span>{t(lang, "activeInsulin")}</span>
            <b>{decimal.format(hasIob ? iobUnits : 0)} U</b>
          </div>
          <div className="sensor-bar">
            <progress
              max={1}
              value={hasIob && injectedUnits ? iobUnits / injectedUnits : 0}
            />
          </div>
          <small>
            {runOut
              ? t(lang, "runsOutAt").replace("{time}", clockTime(runOut, lang))
              : t(lang, "noActiveInsulin")}
          </small>
        </div>

        <div className="sensor-stat">
          <div className="sensor-stat-row">
            <span>{t(lang, "target")}</span>
            <b>
              {decimal.format(settings.target_blood_sugar)} {unit}
            </b>
          </div>
        </div>

        <CorrectionPreview
          settings={settings}
          lang={lang}
          reading={reading}
          iobUnits={hasIob ? iobUnits : 0}
        />

        <small className="sensor-age">
          {minutesAgo === null
            ? t(lang, "tapToMeasure")
            : minutesAgo < 1
              ? t(lang, "readingJustNow")
              : t(lang, "readingMinutesAgo").replace(
                  "{min}",
                  String(minutesAgo),
                )}
        </small>
      </div>

      <Sheet
        open={measuring}
        title={t(lang, "currentGlucose")}
        onClose={() => setMeasuring(false)}
      >
        <ReadingEditor
          lang={lang}
          unit={unit}
          onSave={async (value) => {
            await onSaveReading(value);
            setMeasuring(false);
          }}
        />
      </Sheet>
    </section>
  );
}

function CorrectionPreview({
  settings,
  lang,
  reading,
  iobUnits,
}: {
  settings: Settings;
  lang: Language;
  reading: GlucoseEntry | null;
  iobUnits: number;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const components = reading
    ? correctionComponents(reading.value, settings, iobUnits)
    : null;

  let value = "—";
  let detail: string;
  let tone: "accent" | "muted" | "low" = "muted";
  if (!reading) {
    detail = t(lang, "addReadingForCorrection");
  } else if (!components) {
    detail = t(lang, "setCorrectionFactor");
  } else if (glucoseRange(reading.value, settings.glucose_unit) === "low") {
    value = `${decimal.format(components.units)} U`;
    detail = t(lang, "lowTakeCarbs");
    tone = "low";
  } else if (reading.value <= settings.target_blood_sugar) {
    value = `${decimal.format(components.units)} U`;
    detail = t(lang, "atOrBelowTarget");
  } else {
    value = `${components.units > 0 ? "+" : ""}${decimal.format(components.units)} U`;
    detail = `(${decimal.format(reading.value)} − ${decimal.format(settings.target_blood_sugar)}) ÷ ${decimal.format(components.correctionFactor)}`;
    if (components.iobReduction > 0) {
      detail += ` − ${decimal.format(components.iobReduction)} ${t(lang, "activeInsulin").toLowerCase()}`;
    }
    tone = components.units > 0 ? "accent" : "muted";
  }

  return (
    <div className="sensor-stat" data-tone={tone}>
      <div className="sensor-stat-row">
        <span>{t(lang, "correction")}</span>
        <b className="sensor-correction">{value}</b>
      </div>
      <small>{detail}</small>
    </div>
  );
}

function ReadingEditor({
  lang,
  unit,
  onSave,
}: {
  lang: Language;
  unit: string;
  onSave: (value: number) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const value = parseDecimal(text);
  const valid = value !== null && value > 0;

  return (
    <>
      <NumberField
        label={t(lang, "currentGlucoseHint")}
        unit={unit}
        value={text}
        onChange={setText}
      />
      <Button
        disabled={!valid || saving}
        onClick={async () => {
          if (value === null) return;
          setSaving(true);
          try {
            await onSave(value);
          } finally {
            setSaving(false);
          }
        }}
      >
        {t(lang, "save")}
      </Button>
    </>
  );
}
