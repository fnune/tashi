import type {
  CycleStatus,
  GlucoseEntry,
  GlucoseRange,
  InsulinOnBoard,
  Settings,
} from "@pincho/shared";
import { correctionComponents, glucoseRange } from "@pincho/shared";
import { useState } from "react";
import type { Language, TranslationKey } from "../i18n.js";
import { t } from "../i18n.js";
import { CycleBanner } from "./CycleBanner.js";
import { Button } from "./ui/Button.js";
import { NumberField, parseDecimal } from "./ui/Field.js";
import { Icon } from "./ui/Icon.js";
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
  cycle,
  onSaveReading,
  onSuggestProfile,
}: {
  settings: Settings;
  lang: Language;
  reading: GlucoseEntry | null;
  iob: InsulinOnBoard | null;
  cycle: CycleStatus | null;
  onSaveReading: (value: number) => Promise<void>;
  onSuggestProfile: () => void;
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

  const caption =
    minutesAgo === null
      ? t(lang, "tapToMeasure")
      : `${range ? t(lang, RANGE_LABEL[range]) : ""} · ${
          minutesAgo < 1
            ? t(lang, "readingJustNow")
            : t(lang, "readingMinutesAgo").replace("{min}", String(minutesAgo))
        }`;

  return (
    <section className="sensor">
      <div className="sensor-main">
        <div className="sensor-reading">
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
            <span className="dial-edit" aria-hidden="true">
              <Icon name="pen" size="sm" />
            </span>
          </button>
          <span className="sensor-caption" data-range={range ?? "none"}>
            {caption}
          </span>
        </div>

        <dl className="sensor-stats">
          <div className="sensor-stat">
            <dt>{t(lang, "activeInsulin")}</dt>
            <dd>{decimal.format(hasIob ? iobUnits : 0)} U</dd>
            <div className="sensor-stat-extra sensor-bar">
              <progress
                max={1}
                value={hasIob && injectedUnits ? iobUnits / injectedUnits : 0}
              />
              {runOut && (
                <span>
                  {t(lang, "runsOutAt").replace(
                    "{time}",
                    clockTime(runOut, lang),
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="sensor-stat">
            <dt>{t(lang, "target")}</dt>
            <dd>
              {decimal.format(settings.target_blood_sugar)} {unit}
            </dd>
          </div>
          <CorrectionPreview
            settings={settings}
            lang={lang}
            reading={reading}
            iobUnits={hasIob ? iobUnits : 0}
          />
        </dl>
      </div>

      {cycle && (
        <CycleBanner
          status={cycle}
          lang={lang}
          onSuggestProfile={onSuggestProfile}
        />
      )}

      <Sheet
        open={measuring}
        title={t(lang, "currentGlucose")}
        closeLabel={t(lang, "close")}
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
      detail += ` − ${decimal.format(components.iobReduction)} ${t(lang, "onBoardShort")}`;
    }
    tone = components.units > 0 ? "accent" : "muted";
  }

  return (
    <div className="sensor-stat" data-tone={tone}>
      <dt>{t(lang, "correction")}</dt>
      <dd className="sensor-correction">{value}</dd>
      <div className="sensor-stat-extra">{detail}</div>
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
