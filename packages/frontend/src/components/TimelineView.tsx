import type {
  FastInsulinEntry,
  GlucoseEntry,
  MealEntry,
  Settings,
  SlowInsulinEntry,
  TimelineEntry,
} from "@pincho/shared";
import { getBasalInsulinProfile, getBolusInsulinProfile } from "@pincho/shared";
import { useState } from "react";
import * as api from "../api.js";
import { parseGlucoseInput } from "../glucoseLabels.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { DoseSummary, FoodList } from "./DoseResult.js";
import { Button } from "./ui/Button.js";
import { ConfirmDelete } from "./ui/ConfirmDelete.js";
import { DateTimeField, NumberField } from "./ui/Field.js";
import { Icon, type IconName } from "./ui/Icon.js";
import { Notice } from "./ui/Notice.js";
import { Sheet } from "./ui/Sheet.js";
import { Stepper } from "./ui/Stepper.js";
import "./TimelineView.css";

interface TimelineViewProps {
  timeline: TimelineEntry[];
  settings: Settings;
  lang: Language;
  onRefresh: () => void;
  expandedId?: string;
  onExpand: (id: string | undefined) => void;
  onReuse?: (text: string) => void;
}

type DoseOrReading = FastInsulinEntry | SlowInsulinEntry | GlucoseEntry;
type NewEntryType = DoseOrReading["type"];

const DEFAULT_NEW_UNITS: Record<"fast_insulin" | "slow_insulin", number> = {
  fast_insulin: 1,
  slow_insulin: 10,
};

function toLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function dayLabel(date: Date, lang: Language): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 864e5);
  if (days === 0) return t(lang, "today");
  if (days === 1) return t(lang, "yesterday");
  return date.toLocaleDateString(lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function groupByDay(entries: TimelineEntry[], lang: Language) {
  const groups: { label: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(new Date(entry.timestamp), lang);
    const last = groups.at(-1);
    if (last?.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

function insulinName(entry: FastInsulinEntry | SlowInsulinEntry): string {
  return entry.type === "fast_insulin"
    ? getBolusInsulinProfile(entry.insulin_id).brand_name
    : getBasalInsulinProfile(entry.insulin_id).brand_name;
}

const ICONS: Record<TimelineEntry["type"], IconName> = {
  meal: "meal",
  fast_insulin: "pen",
  slow_insulin: "pen",
  glucose_reading: "drop",
};

const ADDABLE = [
  { type: "fast_insulin", label: "addRapid" },
  { type: "slow_insulin", label: "addBasal" },
  { type: "glucose_reading", label: "addGlucose" },
] as const satisfies { type: NewEntryType; label: string }[];

function EntryRow({
  entry,
  timeline,
  lang,
  onOpen,
}: {
  entry: TimelineEntry;
  timeline: TimelineEntry[];
  lang: Language;
  onOpen: () => void;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const time = new Date(entry.timestamp).toLocaleTimeString(lang, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let title: string;
  let detail: string;
  let value: string;
  switch (entry.type) {
    case "meal":
      title = entry.meal_window.name;
      detail = entry.input_text;
      value = `${decimal.format(entry.total_net_carbs_g)} g`;
      break;
    case "fast_insulin": {
      const meal = timeline.find(
        (e): e is MealEntry =>
          e.type === "meal" && e.id === entry.related_meal_id,
      );
      title = `${t(lang, "rapidInsulin")} · ${insulinName(entry)}`;
      detail = meal
        ? t(lang, "forMeal").replace("{meal}", meal.meal_window.name)
        : t(lang, "addedByHand");
      value = `${decimal.format(entry.units)} U`;
      break;
    }
    case "slow_insulin":
      title = `${t(lang, "basalInsulinShort")} · ${insulinName(entry)}`;
      detail = t(lang, "addedByHand");
      value = `${decimal.format(entry.units)} U`;
      break;
    case "glucose_reading":
      title = t(lang, "glucoseLabel");
      detail = t(lang, "manualReading");
      value = `${decimal.format(entry.value)} ${entry.unit}`;
      break;
  }

  return (
    <button
      type="button"
      className="event"
      data-entry-type={entry.type}
      onClick={onOpen}
    >
      <time dateTime={entry.timestamp}>{time}</time>
      <span className="event-icon" data-kind={entry.type}>
        <Icon name={ICONS[entry.type]} />
      </span>
      <span className="event-text">
        <b>{title}</b>
        <span>{detail}</span>
      </span>
      <span className="event-value num">{value}</span>
      <Icon name="chevron" size="sm" />
    </button>
  );
}

function EntryEditor({
  entry,
  type,
  settings,
  lang,
  onDone,
}: {
  entry: DoseOrReading | null;
  type: NewEntryType;
  settings: Settings;
  lang: Language;
  onDone: () => void;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const initialTime = entry ? new Date(entry.timestamp) : new Date();
  const [when, setWhen] = useState(toLocalDatetime(initialTime));
  const [units, setUnits] = useState(() => {
    if (entry && entry.type !== "glucose_reading") return entry.units;
    return type === "glucose_reading" ? 0 : DEFAULT_NEW_UNITS[type];
  });
  const [readingText, setReadingText] = useState(
    entry?.type === "glucose_reading" ? decimal.format(entry.value) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { value: reading, error: readingError } = parseGlucoseInput(
    readingText,
    entry?.type === "glucose_reading" ? entry.unit : settings.glucose_unit,
    lang,
  );
  const isReading = type === "glucose_reading";
  const valid = isReading ? reading !== null : units > 0;

  async function save() {
    setError(null);
    const timestamp = new Date(when).toISOString();
    try {
      if (isReading && reading !== null) {
        const saved =
          entry ??
          (await api.createTimelineEntry({
            type: "glucose_reading",
            value: reading,
            unit: settings.glucose_unit,
          }));
        await api.updateTimelineEntry(saved.id, {
          type: "glucose_reading",
          value: reading,
          timestamp,
        });
      } else if (type !== "glucose_reading") {
        const saved = entry ?? (await api.createTimelineEntry({ type, units }));
        await api.updateTimelineEntry(saved.id, { type, units, timestamp });
      }
      onDone();
    } catch (e) {
      setError(apiErrorText(lang, e));
    }
  }

  async function remove() {
    if (!entry) return;
    try {
      await api.deleteTimelineEntry(entry.id);
      onDone();
    } catch (e) {
      setError(apiErrorText(lang, e));
    }
  }

  if (confirming) {
    return (
      <ConfirmDelete
        message={t(lang, "confirmDeleteEntry")}
        confirmLabel={t(lang, "deleteEntry")}
        cancelLabel={t(lang, "cancel")}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <>
      {isReading ? (
        <NumberField
          label={t(lang, "glucoseLabel")}
          hideLabel
          unit={settings.glucose_unit}
          value={readingText}
          error={readingError}
          onChange={setReadingText}
        />
      ) : (
        <Stepper
          value={units}
          step={settings.pen_increment}
          unit="U"
          format={(v) => decimal.format(v)}
          decreaseLabel={t(lang, "lessInsulin").replace(
            "{step}",
            decimal.format(settings.pen_increment),
          )}
          increaseLabel={t(lang, "moreInsulin").replace(
            "{step}",
            decimal.format(settings.pen_increment),
          )}
          onChange={setUnits}
        />
      )}
      <DateTimeField
        label={t(lang, "dateTime")}
        value={when}
        onChange={setWhen}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button disabled={!valid} onClick={save}>
        {t(lang, "save")}
      </Button>
      {entry && (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t(lang, "deleteEntry")}
        </Button>
      )}
    </>
  );
}

function MealDetails({
  entry,
  settings,
  lang,
  onDone,
  onReuse,
}: {
  entry: MealEntry;
  settings: Settings;
  lang: Language;
  onDone: () => void;
  onReuse?: (text: string) => void;
}) {
  const [when, setWhen] = useState(toLocalDatetime(new Date(entry.timestamp)));
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const moved = when !== toLocalDatetime(new Date(entry.timestamp));

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(apiErrorText(lang, e));
    }
  }

  if (confirming) {
    return (
      <ConfirmDelete
        message={t(lang, "confirmDeleteEntry")}
        confirmLabel={t(lang, "deleteEntry")}
        cancelLabel={t(lang, "cancel")}
        onConfirm={() => run(() => api.deleteTimelineEntry(entry.id))}
        onCancel={() => setConfirming(false)}
      />
    );
  }

  return (
    <>
      <p className="meal-details-text">{entry.input_text}</p>
      <DoseSummary
        result={entry}
        lang={lang}
        ratioFormat={settings.ratio_format}
        penIncrement={settings.pen_increment}
        showDisclaimer={false}
      />
      <FoodList result={entry} lang={lang} />
      <DateTimeField
        label={t(lang, "dateTime")}
        value={when}
        onChange={setWhen}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {moved && (
        <Button
          onClick={() =>
            run(() =>
              api.updateTimelineEntry(entry.id, {
                type: "meal",
                timestamp: new Date(when).toISOString(),
              }),
            )
          }
        >
          {t(lang, "save")}
        </Button>
      )}
      {onReuse && (
        <Button variant="secondary" onClick={() => onReuse(entry.input_text)}>
          {t(lang, "reuseEntry")}
        </Button>
      )}
      <Button variant="danger" onClick={() => setConfirming(true)}>
        {t(lang, "deleteEntry")}
      </Button>
    </>
  );
}

export function TimelineView({
  timeline,
  settings,
  lang,
  onRefresh,
  expandedId,
  onExpand,
  onReuse,
}: TimelineViewProps) {
  const [adding, setAdding] = useState<NewEntryType | null>(null);
  const [clearing, setClearing] = useState(false);
  const sorted = [...timeline].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const open = sorted.find((e) => e.id === expandedId) ?? null;

  function close() {
    setAdding(null);
    onExpand(undefined);
  }

  function done() {
    close();
    onRefresh();
  }

  async function handleClear() {
    await api.clearTimeline();
    setClearing(false);
    onRefresh();
  }

  const editorType: NewEntryType | null =
    adding ?? (open && open.type !== "meal" ? open.type : null);
  const editorTitle =
    adding === "fast_insulin"
      ? t(lang, "newRapid")
      : adding === "slow_insulin"
        ? t(lang, "newBasal")
        : adding === "glucose_reading"
          ? t(lang, "newReading")
          : open?.type === "glucose_reading"
            ? t(lang, "editReading")
            : t(lang, "editInsulin");

  return (
    <div className="timeline">
      <h2 className="screen-title">{t(lang, "timeline")}</h2>

      <section className="section">
        <h3 className="section-heading">{t(lang, "addTitle")}</h3>
        <div className="quick-add">
          {ADDABLE.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className="quick-add-tile"
              data-kind={type}
              onClick={() => setAdding(type)}
            >
              <Icon name={ICONS[type]} />
              {t(lang, label)}
            </button>
          ))}
        </div>
      </section>

      {sorted.length === 0 && (
        <p className="timeline-empty">{t(lang, "noTimeline")}</p>
      )}

      {groupByDay(sorted, lang).map((group) => (
        <section className="section" key={group.label}>
          <h3 className="section-heading">{group.label}</h3>
          <div className="timeline-events">
            {group.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                timeline={sorted}
                lang={lang}
                onOpen={() => onExpand(entry.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {sorted.length > 0 && (
        <Button
          variant="danger"
          className="timeline-clear"
          onClick={handleClear}
        >
          {t(lang, "clearTimeline")}
        </Button>
      )}

      <Sheet
        open={clearing}
        title={t(lang, "confirmClearTimeline")}
        closeLabel={t(lang, "close")}
        onClose={() => setClearing(false)}
      >
        <ConfirmDelete
          message={t(lang, "confirmClearTimelineBody")}
          confirmLabel={t(lang, "clearTimeline")}
          cancelLabel={t(lang, "cancel")}
          onConfirm={handleClear}
          onCancel={() => setClearing(false)}
        />
      </Sheet>

      <Sheet
        open={editorType !== null}
        title={editorTitle}
        closeLabel={t(lang, "close")}
        onClose={close}
      >
        {editorType && (
          <EntryEditor
            key={open?.id ?? editorType}
            entry={open && open.type !== "meal" ? open : null}
            type={editorType}
            settings={settings}
            lang={lang}
            onDone={done}
          />
        )}
      </Sheet>

      <Sheet
        open={open?.type === "meal"}
        title={open?.type === "meal" ? open.meal_window.name : ""}
        closeLabel={t(lang, "close")}
        onClose={close}
      >
        {open?.type === "meal" && (
          <MealDetails
            entry={open}
            settings={settings}
            lang={lang}
            onDone={done}
            onReuse={onReuse}
          />
        )}
      </Sheet>
    </div>
  );
}
