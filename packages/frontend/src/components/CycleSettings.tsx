import type { CycleTracking, Settings } from "@pincho/shared";
import {
  cycleStatus,
  MAX_CYCLE_DAYS,
  MIN_CYCLE_DAYS,
  toLocalDateString,
} from "@pincho/shared";
import { useState } from "react";
import { type Language, t } from "../i18n.js";
import { CycleChart } from "./CycleChart.js";
import { Button } from "./ui/Button.js";
import { Icon } from "./ui/Icon.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Segmented } from "./ui/Segmented.js";
import { Sheet } from "./ui/Sheet.js";
import { Stepper } from "./ui/Stepper.js";
import { Toggle } from "./ui/Toggle.js";
import "./CycleSettings.css";

const REVIEW_URL = "https://pmc.ncbi.nlm.nih.gov/articles/PMC9962060/";
const STUDY_URL = "https://doi.org/10.2337/dc26-0692";

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
      <ListGroup title={t(lang, "cycleTitle")}>
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
            <details className="cycle-disclosure">
              <summary>
                {t(lang, "cycleChart")}
                <Icon name="chevron" size="sm" />
              </summary>
              <div className="cycle-disclosure-body">
                <CycleChart
                  length={cycle.length_days}
                  today={status?.day ?? null}
                  currentPhase={status?.phase ?? null}
                  lang={lang}
                />
                <p className="cycle-how-to">{t(lang, "cycleHowTo")}</p>
                <p className="cycle-note">
                  {t(lang, "cycleNote")}{" "}
                  <a href={STUDY_URL} target="_blank" rel="noreferrer">
                    {t(lang, "cycleStudy")}
                  </a>
                  {" · "}
                  <a href={REVIEW_URL} target="_blank" rel="noreferrer">
                    {t(lang, "cycleSource")}
                  </a>
                </p>
              </div>
            </details>
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
  const now = new Date();
  const today = toLocalDateString(now);
  const yesterday = toLocalDateString(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1),
  );
  const [date, setDate] = useState(initial ?? today);
  return (
    <>
      <div className="cycle-start-picker">
        <Segmented
          label={t(lang, "lastPeriodStart")}
          value={date}
          options={[
            { value: today, label: t(lang, "today") },
            { value: yesterday, label: t(lang, "yesterday") },
          ]}
          onChange={setDate}
        />
        <input
          className="field-input"
          type="date"
          aria-label={t(lang, "lastPeriodStart")}
          max={today}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
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
