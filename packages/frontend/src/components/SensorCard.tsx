import type {
  CycleStatus,
  GlucoseEntry,
  GlucoseRange,
  GlucoseUnit,
  InsulinOnBoard,
  Settings,
} from "@pincho/shared";
import {
  correctionComponents,
  GLUCOSE_RANGE_LIMITS,
  glucoseRange,
} from "@pincho/shared";
import { useState } from "react";
import { parseGlucoseInput } from "../glucoseLabels.js";
import type { Language, TranslationKey } from "../i18n.js";
import { t } from "../i18n.js";
import { CycleBanner } from "./CycleBanner.js";
import { GlucoseGauge } from "./GlucoseGauge.js";
import { Button } from "./ui/Button.js";
import { NumberField } from "./ui/Field.js";
import { Icon, type IconName } from "./ui/Icon.js";
import { Sheet } from "./ui/Sheet.js";
import "./SensorCard.css";

const RANGE_LABEL: Record<GlucoseRange, TranslationKey> = {
  low: "glucoseLow",
  in_range: "inRange",
  high: "glucoseHigh",
};

const RANGE_ICON: Record<GlucoseRange, IconName> = {
  low: "down",
  in_range: "check",
  high: "up",
};

const VISIBLE_IOB_UNITS = 0.05;

function clockTime(date: Date, lang: Language): string {
  return date.toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
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
  onConfirmPeriod,
}: {
  settings: Settings;
  lang: Language;
  reading: GlucoseEntry | null;
  iob: InsulinOnBoard | null;
  cycle: CycleStatus | null;
  onSaveReading: (value: number) => Promise<void>;
  onSuggestProfile: () => void;
  onConfirmPeriod: () => void;
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

  const age =
    minutesAgo === null
      ? null
      : minutesAgo < 1
        ? t(lang, "readingJustNow")
        : t(lang, "readingMinutesAgo").replace("{min}", String(minutesAgo));

  const limits = GLUCOSE_RANGE_LIMITS[unit];
  const gaugeLabel = reading
    ? t(lang, "gaugeLabel")
        .replace("{value}", decimal.format(reading.value))
        .replace("{unit}", unit)
        .replace(
          "{state}",
          range ? t(lang, RANGE_LABEL[range]).toLowerCase() : "",
        )
        .replace("{low}", decimal.format(limits.low))
        .replace("{high}", decimal.format(limits.high))
        .concat(age ? ` ${age}.` : "")
    : t(lang, "gaugeEmptyLabel");

  return (
    <section className="sensor" aria-label={t(lang, "currentGlucose")}>
      <div className="sensor-main">
        <div className="gauge">
          <div className="gauge-figure" role="img" aria-label={gaugeLabel}>
            <GlucoseGauge
              value={reading?.value ?? null}
              unit={unit}
              range={range}
            />
            <div className="gauge-centre" aria-hidden="true">
              {reading ? (
                <>
                  <span className="gauge-value num">
                    {decimal.format(reading.value)}
                  </span>
                  <span className="gauge-unit">{unit}</span>
                </>
              ) : (
                <span className="gauge-empty">{t(lang, "noReading")}</span>
              )}
              {range && (
                <span className="gauge-state" data-range={range}>
                  <Icon name={RANGE_ICON[range]} size="sm" />
                  {t(lang, RANGE_LABEL[range])}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="gauge-edit"
            title={age ?? undefined}
            aria-label={t(lang, reading ? "editGlucose" : "addGlucoseReading")}
            onClick={() => setMeasuring(true)}
          >
            <Icon name={reading ? "edit" : "plus"} size="sm" />
            {t(lang, reading ? "editGlucoseShort" : "addGlucoseShort")}
          </button>
        </div>

        <dl className="sensor-stats">
          <div className="sensor-stat">
            <dt>{t(lang, "activeInsulin")}</dt>
            <dd className="num">{decimal.format(hasIob ? iobUnits : 0)} U</dd>
            {hasIob && (
              <div className="sensor-stat-extra sensor-bar">
                <progress
                  max={1}
                  value={injectedUnits ? iobUnits / injectedUnits : 0}
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
            )}
          </div>
          <div className="sensor-stat">
            <dt>{t(lang, "target")}</dt>
            <dd className="num">
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
          onConfirmPeriod={onConfirmPeriod}
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

  if (!reading) {
    return (
      <div className="sensor-stat" data-tone="muted">
        <dt>{t(lang, "correction")}</dt>
        <dd className="sensor-correction num">—</dd>
      </div>
    );
  }

  let value = "—";
  let detail: string;
  let tone: "accent" | "muted" | "low" = "muted";
  if (!components) {
    detail = t(lang, "setCorrectionFactor");
  } else if (glucoseRange(reading.value, settings.glucose_unit) === "low") {
    value = `${decimal.format(components.units)} U`;
    detail = t(lang, "lowTakeCarbs");
    tone = "low";
  } else if (reading.value <= settings.target_blood_sugar) {
    value = `${decimal.format(components.units)} U`;
    detail = t(lang, "atOrBelowTarget");
  } else {
    value = `${components.units > 0 ? "+" : components.units < 0 ? "−" : ""}${decimal.format(Math.abs(components.units))} U`;
    detail = `(${decimal.format(reading.value)} − ${decimal.format(settings.target_blood_sugar)}) ÷ ${decimal.format(components.correctionFactor)}`;
    if (components.iobReduction > 0) {
      detail += ` − ${decimal.format(components.iobReduction)} ${t(lang, "onBoardShort")}`;
    }
    tone = components.units > 0 ? "accent" : "muted";
  }

  return (
    <div className="sensor-stat" data-tone={tone}>
      <dt>{t(lang, "correction")}</dt>
      <dd className="sensor-correction num">{value}</dd>
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
  unit: GlucoseUnit;
  onSave: (value: number) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const { value, error } = parseGlucoseInput(text, unit, lang);

  return (
    <>
      <NumberField
        label={t(lang, "glucoseLabel")}
        hideLabel
        unit={unit}
        value={text}
        error={error}
        onChange={setText}
      />
      <Button
        disabled={value === null || saving}
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
