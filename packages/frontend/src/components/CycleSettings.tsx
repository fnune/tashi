import type { CycleTracking, Settings } from "@pincho/shared";
import {
  cycleStatus,
  MAX_CYCLE_DAYS,
  MIN_CYCLE_DAYS,
  toLocalDateString,
} from "@pincho/shared";
import { useState } from "react";
import { type Language, t } from "../i18n.js";
import { HormoneChart } from "./HormoneChart.js";
import { Button } from "./ui/Button.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Sheet } from "./ui/Sheet.js";
import { Stepper } from "./ui/Stepper.js";
import { Toggle } from "./ui/Toggle.js";
import "./CycleSettings.css";

const EVIDENCE_URL = "https://pmc.ncbi.nlm.nih.gov/articles/PMC9962060/";

function formatDate(iso: string, lang: Language): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1).toLocaleDateString(
    lang,
    { day: "numeric", month: "short" },
  );
}

export function CycleSettings({
  id,
  settings,
  lang,
  onChange,
}: {
  id: string;
  settings: Settings;
  lang: Language;
  onChange: (cycle: CycleTracking) => void;
}) {
  const [editing, setEditing] = useState<"start" | "length" | null>(null);
  const cycle = settings.cycle;
  const status = cycleStatus(cycle, new Date());
  const update = (patch: Partial<CycleTracking>) => {
    onChange({ ...cycle, ...patch });
    setEditing(null);
  };

  return (
    <div id={id} className="cycle-settings">
      <ListGroup
        title={t(lang, "cycleTitle")}
        footer={
          cycle.enabled ? (
            <>
              {t(lang, "cycleNote")}{" "}
              <a href={EVIDENCE_URL} target="_blank" rel="noreferrer">
                {t(lang, "cycleSource")}
              </a>
            </>
          ) : undefined
        }
      >
        <ListRow
          label={t(lang, "cycleTracking")}
          detail={t(lang, "cycleTrackingDetail")}
        >
          <Toggle
            label={t(lang, "cycleTracking")}
            checked={cycle.enabled}
            onChange={(enabled) => update({ enabled })}
          />
        </ListRow>

        {cycle.enabled && (
          <>
            <div
              className="cycle-status"
              data-phase={status?.phase ?? "unknown"}
            >
              <div className="cycle-status-head">
                <b>
                  {status
                    ? t(lang, "cycleDayOf")
                        .replace("{day}", String(status.day))
                        .replace("{length}", String(status.length))
                    : t(lang, "addPeriodStart")}
                </b>
                {status && (
                  <span className="cycle-phase">
                    ● {t(lang, `phase_${status.phase}`)}
                  </span>
                )}
              </div>
              <HormoneChart
                length={cycle.length_days}
                today={status?.day ?? null}
                label={t(lang, "cycleTitle")}
              />
              <div className="cycle-legend">
                <span data-series="period">{t(lang, "phase_period")}</span>
                <span data-series="progesterone">
                  {t(lang, "progesterone")}
                </span>
                <span data-series="estradiol">{t(lang, "estradiol")}</span>
                <span data-series="luteal">
                  {t(lang, "possibleResistance")}
                </span>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  update({ last_period_start: toLocalDateString(new Date()) })
                }
              >
                {t(lang, "todayIsDayOne")}
              </Button>
            </div>
            <ListButton
              label={t(lang, "lastPeriodStart")}
              detail={
                status
                  ? t(lang, "nextPeriod").replace(
                      "{date}",
                      formatDate(toLocalDateString(status.nextPeriod), lang),
                    )
                  : undefined
              }
              value={
                cycle.last_period_start
                  ? formatDate(cycle.last_period_start, lang)
                  : t(lang, "notSet")
              }
              onClick={() => setEditing("start")}
            />
            <ListButton
              label={t(lang, "cycleLength")}
              value={`${cycle.length_days} ${t(lang, "daysUnit")}`}
              onClick={() => setEditing("length")}
            />
          </>
        )}
      </ListGroup>

      <Sheet
        open={editing === "start"}
        title={t(lang, "lastPeriodStart")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <StartEditor
          lang={lang}
          initial={cycle.last_period_start}
          onSave={(last_period_start) => update({ last_period_start })}
        />
      </Sheet>

      <Sheet
        open={editing === "length"}
        title={t(lang, "cycleLength")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <LengthEditor
          lang={lang}
          initial={cycle.length_days}
          onSave={(length_days) => update({ length_days })}
        />
      </Sheet>
    </div>
  );
}

function StartEditor({
  lang,
  initial,
  onSave,
}: {
  lang: Language;
  initial: string | null;
  onSave: (date: string) => void;
}) {
  const today = toLocalDateString(new Date());
  const [date, setDate] = useState(initial ?? today);
  return (
    <>
      <input
        className="field-input"
        type="date"
        aria-label={t(lang, "lastPeriodStart")}
        max={today}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <Button disabled={!date || date > today} onClick={() => onSave(date)}>
        {t(lang, "save")}
      </Button>
    </>
  );
}

function LengthEditor({
  lang,
  initial,
  onSave,
}: {
  lang: Language;
  initial: number;
  onSave: (days: number) => void;
}) {
  const [days, setDays] = useState(initial);
  return (
    <>
      <Stepper
        value={days}
        step={1}
        min={MIN_CYCLE_DAYS}
        unit={t(lang, "daysUnit")}
        format={String}
        decreaseLabel="−1"
        increaseLabel="+1"
        onChange={(next) => setDays(Math.min(MAX_CYCLE_DAYS, next))}
      />
      <Button onClick={() => onSave(days)}>{t(lang, "save")}</Button>
    </>
  );
}
