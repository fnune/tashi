import type {
  BasalInsulinId,
  BolusInsulinId,
  GlucoseUnit,
  MealWindow,
  Profile,
  RatioFormat,
  Settings,
  SourceRef,
} from "@pincho/shared";
import {
  activeProfile,
  allowedEndHours,
  allowedStartHours,
  basalInsulinProfiles,
  bolusInsulinProfiles,
  DEFAULT_SETTINGS,
  extendWindowOverGap,
  getBasalInsulinProfile,
  getBolusInsulinProfile,
  MAX_DIA_MINUTES,
  MIN_DIA_MINUTES,
  mergeWindowIntoPrevious,
  moveWindowEnd,
  moveWindowStart,
  NORMAL_PROFILE_ID,
  renameWindowInProfiles,
  sortByStart,
  splitLongestWindow,
  uncoveredHours,
  windowLength,
  windowRatio,
} from "@pincho/shared";
import { useEffect, useState } from "react";
import { useLocation, useSearchParams } from "react-router";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import {
  parseRatioInput,
  ratioHint,
  ratioInputText,
  ratioUnit,
} from "../ratioLabels.js";
import { RATIOS_ANCHOR } from "./AppHeader.js";
import { CycleSettings } from "./CycleSettings.js";
import { DayBar } from "./DayBar.js";
import { IobCurve } from "./IobCurve.js";
import { Logo } from "./Logo.js";
import { ProfileChips } from "./ProfileChips.js";
import { ProfileEditor } from "./ProfileEditor.js";
import { RatioValue } from "./RatioValue.js";
import { Button } from "./ui/Button.js";
import {
  NumberField,
  parseDecimal,
  SelectField,
  TextField,
} from "./ui/Field.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Notice } from "./ui/Notice.js";
import { OptionList } from "./ui/OptionList.js";
import { Segmented } from "./ui/Segmented.js";
import { Sheet } from "./ui/Sheet.js";
import "./SettingsView.css";

interface SettingsViewProps {
  settings: Settings;
  onSave: (s: Settings) => void;
  lang: Language;
}

type Editing =
  | { kind: "profile"; profile: Profile; isNew: boolean }
  | { kind: "window"; index: number; draft: MealWindow[] }
  | { kind: "correction" }
  | { kind: "target" }
  | { kind: "fatProtein" }
  | { kind: "bolus" }
  | { kind: "basal" };

const SERIES_COUNT = 4;

const MENSTRUATION_PRESET = DEFAULT_SETTINGS.profiles.find(
  (p) => p.id === "menstruation",
);

function formatHour(hour: number): string {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}

function formatRange(window: { start_hour: number; end_hour: number }) {
  return `${formatHour(window.start_hour)}–${formatHour(window.end_hour)}`;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

export function SettingsView({ settings, onSave, lang }: SettingsViewProps) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { hash } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  useEffect(() => {
    if (
      !MENSTRUATION_PRESET ||
      searchParams.get("newProfile") !== MENSTRUATION_PRESET.id
    ) {
      return;
    }
    setSearchParams({}, { replace: true });
    setEditing({
      kind: "profile",
      isNew: true,
      profile: {
        ...MENSTRUATION_PRESET,
        name: t(lang, "profile_menstruation"),
      },
    });
  }, [searchParams, setSearchParams, lang]);
  const number = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const unit = settings.glucose_unit;
  const windows = sortByStart(settings.meal_windows);
  const gaps = uncoveredHours(windows);

  async function persist(next: Settings) {
    const previous = settings;
    setError(null);
    onSave(next);
    try {
      onSave(await api.saveSettings(next));
      setEditing(null);
    } catch (e) {
      onSave(previous);
      setError(apiErrorText(lang, e));
    }
  }

  function addWindow() {
    const { windows: next, addedIndex } = splitLongestWindow(windows);
    if (addedIndex === -1) return;
    setEditing({ kind: "window", index: addedIndex, draft: next });
  }

  function saveProfile(profile: Profile) {
    const exists = settings.profiles.some((p) => p.id === profile.id);
    persist({
      ...settings,
      profiles: exists
        ? settings.profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...settings.profiles, profile],
    });
  }

  function deleteProfile(id: string) {
    persist({
      ...settings,
      profiles: settings.profiles.filter((p) => p.id !== id),
      active_profile_id:
        settings.active_profile_id === id
          ? NORMAL_PROFILE_ID
          : settings.active_profile_id,
    });
  }

  function saveWindows(next: MealWindow[], edited: number) {
    const before = windows[edited];
    const after = next[edited];
    const renamed =
      before && after && before.start_hour === after.start_hour
        ? renameWindowInProfiles(settings.profiles, before.name, after.name)
        : settings.profiles;
    persist({ ...settings, meal_windows: next, profiles: renamed });
  }

  const active = activeProfile(settings);
  const bolus = settings.bolus_insulin_id
    ? getBolusInsulinProfile(settings.bolus_insulin_id)
    : null;
  const basal = settings.basal_insulin_id
    ? getBasalInsulinProfile(settings.basal_insulin_id)
    : null;

  return (
    <div className="settings">
      <h2 className="screen-title">{t(lang, "settings")}</h2>

      {error && !editing && <Notice tone="danger">{error}</Notice>}

      <ListGroup title={t(lang, "dosing")}>
        <ListButton
          label={t(lang, "correctionFactor")}
          detail={t(lang, "correctionFactorDetail")}
          value={
            settings.correction_factor === null
              ? t(lang, "notSet")
              : `${number.format(settings.correction_factor)} ${unit}`
          }
          onClick={() => setEditing({ kind: "correction" })}
        />
        <ListButton
          label={t(lang, "targetBloodSugar")}
          value={`${number.format(settings.target_blood_sugar)} ${unit}`}
          onClick={() => setEditing({ kind: "target" })}
        />
        <ListButton
          label={t(lang, "fatProteinMultiplier")}
          detail={t(lang, "fatProteinDetail")}
          value={`+${Math.round(settings.fat_protein_multiplier * 100)} %`}
          onClick={() => setEditing({ kind: "fatProtein" })}
        />
        <ListRow label={t(lang, "penIncrement")}>
          <Segmented
            label={t(lang, "penIncrement")}
            value={settings.pen_increment}
            options={[
              { value: 0.5, label: `${number.format(0.5)} U` },
              { value: 1, label: "1 U" },
            ]}
            onChange={(pen_increment) =>
              persist({ ...settings, pen_increment })
            }
          />
        </ListRow>
      </ListGroup>

      <ListGroup title={t(lang, "insulins")}>
        <ListButton
          label={t(lang, "rapidInsulin")}
          detail={
            bolus && settings.insulin_action_minutes
              ? `DIA ${formatMinutes(settings.insulin_action_minutes)}`
              : undefined
          }
          value={bolus?.brand_name ?? t(lang, "notSet")}
          onClick={() => setEditing({ kind: "bolus" })}
        />
        <ListButton
          label={t(lang, "basalInsulinShort")}
          value={basal?.brand_name ?? t(lang, "notSet")}
          onClick={() => setEditing({ kind: "basal" })}
        />
      </ListGroup>

      {gaps.map((gap) => {
        const before = windows.find(
          (w) => w.end_hour % 24 === gap.start_hour % 24,
        );
        return (
          <div className="settings-gap" key={gap.start_hour}>
            <span>
              {t(lang, "uncoveredHours").replace("{range}", formatRange(gap))}
            </span>
            {before && (
              <Button
                variant="secondary"
                onClick={() =>
                  persist({
                    ...settings,
                    meal_windows: extendWindowOverGap(windows, gap),
                  })
                }
              >
                {t(lang, "extendWindow").replace(
                  "{name}",
                  before.name || t(lang, "unnamedWindow"),
                )}
              </Button>
            )}
          </div>
        );
      })}

      <ListGroup
        id={RATIOS_ANCHOR}
        title={t(lang, "ratiosTitle")}
        action={
          <button
            type="button"
            className="list-group-action"
            onClick={() =>
              setEditing({
                kind: "profile",
                isNew: true,
                profile: {
                  id: crypto.randomUUID(),
                  name: "",
                  emoji: "⭐",
                  adjustment: { mode: "percent", percent: 0 },
                },
              })
            }
          >
            + {t(lang, "addProfile")}
          </button>
        }
        footer={t(lang, "windowsTileDay")}
      >
        <ProfileChips
          inline
          label={t(lang, "activeProfile")}
          settings={settings}
          lang={lang}
          onSelect={(active_profile_id) =>
            persist({ ...settings, active_profile_id })
          }
          onEdit={(profile) =>
            setEditing({ kind: "profile", profile, isNew: false })
          }
        />
        <DayBar windows={windows} />
        {windows.map((w, i) => (
          <ListButton
            key={`${w.start_hour}-${w.name}`}
            label={
              <span className="window-label">
                <span
                  className={`window-swatch day-bar-series-${(i % SERIES_COUNT) + 1}`}
                />
                {w.name || t(lang, "unnamedWindow")}
              </span>
            }
            detail={windowLength(w) === 24 ? t(lang, "allDay") : formatRange(w)}
            value={
              <RatioValue
                ratio={windowRatio(active, w)}
                format={settings.ratio_format}
                lang={lang}
              />
            }
            onClick={() =>
              setEditing({ kind: "window", index: i, draft: windows })
            }
          />
        ))}
        <ListButton
          tone="accent"
          label={`+ ${t(lang, "addWindow")}`}
          onClick={addWindow}
        />
      </ListGroup>

      <ListGroup title={t(lang, "general")}>
        <ListRow label={t(lang, "glucoseUnit")}>
          <Segmented<GlucoseUnit>
            label={t(lang, "glucoseUnit")}
            value={unit}
            options={[
              { value: "mg/dL", label: "mg/dL" },
              { value: "mmol/L", label: "mmol/L" },
            ]}
            onChange={(glucose_unit) => persist({ ...settings, glucose_unit })}
          />
        </ListRow>
        <ListRow label={t(lang, "ratioFormat")}>
          <Segmented<RatioFormat>
            label={t(lang, "ratioFormat")}
            value={settings.ratio_format}
            options={[
              {
                value: "grams_per_unit",
                label: ratioUnit("grams_per_unit", lang),
              },
              {
                value: "units_per_10g",
                label: ratioUnit("units_per_10g", lang),
              },
            ]}
            onChange={(ratio_format) => persist({ ...settings, ratio_format })}
          />
        </ListRow>
        <ListRow label={t(lang, "language")}>
          <Segmented<Language>
            label={t(lang, "language")}
            value={settings.language}
            options={[
              { value: "es", label: "Español" },
              { value: "en", label: "English" },
            ]}
            onChange={(language) => persist({ ...settings, language })}
          />
        </ListRow>
      </ListGroup>

      <CycleSettings
        id="cycle"
        settings={settings}
        lang={lang}
        onChange={(cycle) => persist({ ...settings, cycle })}
      />

      <section className="settings-about">
        <Logo className="settings-about-logo" />
        <div>
          <b>{t(lang, "appTitle")}</b>
          <span>{t(lang, "aboutTagline")}</span>
        </div>
      </section>

      <Sheet
        open={editing?.kind === "profile"}
        title={
          editing?.kind === "profile" && !editing.isNew
            ? t(lang, "editProfile")
            : t(lang, "newProfileTitle")
        }
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        {editing?.kind === "profile" && (
          <ProfileEditor
            profile={editing.profile}
            isNew={editing.isNew}
            ratioFormat={settings.ratio_format}
            windows={windows}
            lang={lang}
            error={error}
            onSave={saveProfile}
            onDelete={
              editing.isNew
                ? undefined
                : () => deleteProfile(editing.profile.id)
            }
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === "window"}
        title={t(lang, "editWindow")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        {editing?.kind === "window" && (
          <WindowEditor
            lang={lang}
            ratioFormat={settings.ratio_format}
            windows={editing.draft}
            index={editing.index}
            error={error}
            onSave={(meal_windows) => saveWindows(meal_windows, editing.index)}
          />
        )}
      </Sheet>

      <Sheet
        open={editing?.kind === "correction"}
        title={t(lang, "correctionFactor")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <NumberEditor
          lang={lang}
          label={t(lang, "correctionFactorDetail")}
          unit={unit}
          initial={settings.correction_factor}
          optional
          error={error}
          onSave={(correction_factor) =>
            persist({ ...settings, correction_factor })
          }
        />
      </Sheet>

      <Sheet
        open={editing?.kind === "target"}
        title={t(lang, "targetBloodSugar")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <NumberEditor
          lang={lang}
          label={t(lang, "targetBloodSugar")}
          unit={unit}
          initial={settings.target_blood_sugar}
          error={error}
          onSave={(target) =>
            target !== null &&
            persist({ ...settings, target_blood_sugar: target })
          }
        />
      </Sheet>

      <Sheet
        open={editing?.kind === "fatProtein"}
        title={t(lang, "fatProteinMultiplier")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <NumberEditor
          lang={lang}
          label={t(lang, "fatProteinMultiplierHint")}
          unit="%"
          initial={Math.round(settings.fat_protein_multiplier * 100)}
          max={100}
          allowZero
          error={error}
          onSave={(percent) =>
            percent !== null &&
            persist({ ...settings, fat_protein_multiplier: percent / 100 })
          }
        />
      </Sheet>

      <Sheet
        open={editing?.kind === "bolus"}
        title={t(lang, "bolusInsulin")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <BolusEditor
          lang={lang}
          settings={settings}
          error={error}
          onSave={persist}
        />
      </Sheet>

      <Sheet
        open={editing?.kind === "basal"}
        title={t(lang, "basalInsulin")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <BasalEditor
          lang={lang}
          initial={settings.basal_insulin_id}
          error={error}
          onSave={(basal_insulin_id) =>
            persist({ ...settings, basal_insulin_id })
          }
        />
      </Sheet>
    </div>
  );
}

function SheetError({ error }: { error: string | null }) {
  return error ? <Notice tone="danger">{error}</Notice> : null;
}

function WindowEditor({
  lang,
  windows: initial,
  index,
  ratioFormat,
  error,
  onSave,
}: {
  lang: Language;
  ratioFormat: RatioFormat;
  windows: MealWindow[];
  index: number;
  error: string | null;
  onSave: (windows: MealWindow[]) => void;
}) {
  const [windows, setWindows] = useState(initial);
  const window = windows[index];
  const originalRatio = window?.ratio;
  const [ratioText, setRatioText] = useState(
    originalRatio === undefined
      ? ""
      : ratioInputText(originalRatio, ratioFormat, lang),
  );
  if (!window) return null;

  const ratio = parseRatioInput(ratioText, ratioFormat, lang, originalRatio);
  const valid = ratio !== null;
  const hourOptions = (hours: number[], current: number) =>
    [...new Set([current, ...hours])]
      .sort((a, b) => a - b)
      .map((hour) => ({ value: hour, label: formatHour(hour) }));
  const update = (patch: Partial<MealWindow>) =>
    setWindows(windows.map((w, i) => (i === index ? { ...w, ...patch } : w)));

  return (
    <>
      <TextField
        label={t(lang, "mealName")}
        value={window.name}
        onChange={(name) => update({ name })}
      />
      {windows.length > 1 && (
        <div className="settings-hours">
          <SelectField
            label={t(lang, "startsAt")}
            value={window.start_hour % 24}
            options={hourOptions(
              allowedStartHours(windows, index),
              window.start_hour % 24,
            )}
            onChange={(hour) =>
              setWindows(moveWindowStart(windows, index, hour))
            }
          />
          <SelectField
            label={t(lang, "endsAt")}
            value={window.end_hour % 24}
            options={hourOptions(
              allowedEndHours(windows, index),
              window.end_hour % 24,
            )}
            onChange={(hour) => setWindows(moveWindowEnd(windows, index, hour))}
          />
        </div>
      )}
      <NumberField
        label={ratioHint(ratioFormat, lang)}
        unit={ratioUnit(ratioFormat, lang)}
        value={ratioText}
        onChange={setRatioText}
      />
      <SheetError error={error} />
      <Button
        disabled={!valid}
        onClick={() =>
          ratio !== null &&
          onSave(
            windows.map((w, i) =>
              i === index ? { ...w, ratio, name: w.name.trim() } : w,
            ),
          )
        }
      >
        {t(lang, "save")}
      </Button>
      {windows.length > 1 && (
        <Button
          variant="danger"
          onClick={() => onSave(mergeWindowIntoPrevious(windows, index))}
        >
          {t(lang, "deleteWindow")}
        </Button>
      )}
    </>
  );
}

function NumberEditor({
  lang,
  label,
  unit,
  initial,
  optional = false,
  allowZero = false,
  max,
  error,
  onSave,
}: {
  lang: Language;
  label: string;
  unit: string;
  initial: number | null;
  optional?: boolean;
  allowZero?: boolean;
  max?: number;
  error: string | null;
  onSave: (value: number | null) => void;
}) {
  const [text, setText] = useState(
    initial === null
      ? ""
      : String(initial).replace(".", lang === "es" ? "," : "."),
  );
  const value = parseDecimal(text);
  const empty = text.trim() === "";
  const inRange =
    value !== null &&
    (allowZero ? value >= 0 : value > 0) &&
    (max === undefined || value <= max);
  const valid = empty ? optional : inRange;

  return (
    <>
      <NumberField label={label} unit={unit} value={text} onChange={setText} />
      <SheetError error={error} />
      <Button disabled={!valid} onClick={() => onSave(empty ? null : value)}>
        {t(lang, "save")}
      </Button>
    </>
  );
}

function BolusEditor({
  lang,
  settings,
  error,
  onSave,
}: {
  lang: Language;
  settings: Settings;
  error: string | null;
  onSave: (settings: Settings) => void;
}) {
  const [insulinId, setInsulinId] = useState<BolusInsulinId | null>(
    settings.bolus_insulin_id,
  );
  const [diaText, setDiaText] = useState(
    settings.insulin_action_minutes?.toString() ?? "",
  );
  const profile = insulinId ? getBolusInsulinProfile(insulinId) : null;
  const dia = parseDecimal(diaText);
  const diaInRange =
    dia !== null && dia >= MIN_DIA_MINUTES && dia <= MAX_DIA_MINUTES;
  const plottable =
    profile !== null &&
    dia !== null &&
    diaInRange &&
    profile.action.peak_minutes * 2 < dia;
  const rangeMessage = t(lang, "insulinActionOutOfRange")
    .replace("{min}", String(MIN_DIA_MINUTES))
    .replace("{max}", String(MAX_DIA_MINUTES));
  const sources = profile
    ? dedupeSources([profile.label_source, ...profile.action.sources])
    : [];

  function pick(id: BolusInsulinId) {
    setInsulinId(id);
    if (!diaText) {
      setDiaText(String(getBolusInsulinProfile(id).action.duration_minutes));
    }
  }

  return (
    <>
      <OptionList
        label={t(lang, "bolusInsulin")}
        value={insulinId}
        options={bolusInsulinProfiles().map((p) => ({
          value: p.id,
          title: p.brand_name,
          detail: p.generic_name,
        }))}
        onChange={pick}
      />
      {profile && (
        <>
          <NumberField
            label={t(lang, "insulinActionDuration")}
            unit="min"
            value={diaText}
            onChange={setDiaText}
            hint={diaInRange ? undefined : rangeMessage}
          />
          <figure className="iob-curve-figure">
            <div className="iob-curve-frame">
              {plottable && dia !== null ? (
                <IobCurve
                  peakMinutes={profile.action.peak_minutes}
                  durationMinutes={dia}
                  peakLabel={`${t(lang, "insulinPeak")} ${formatMinutes(
                    profile.action.peak_minutes,
                  )}`}
                />
              ) : (
                <p className="iob-curve-placeholder">{rangeMessage}</p>
              )}
            </div>
            <div className="iob-curve-legend">
              <span className="iob-legend iob-legend-activity">
                {t(lang, "activityLegend")}
              </span>
              <span className="iob-legend iob-legend-iob">
                {t(lang, "iobLegend")}
              </span>
            </div>
            <figcaption className="iob-curve-caption">
              {t(lang, "iobCurveCaption")}
            </figcaption>
            {sources.length > 0 && (
              <div className="iob-curve-sources">
                <span className="iob-curve-sources-label">
                  {t(lang, "iobCurveSources")}
                </span>
                <ul>
                  {sources.map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </figure>
        </>
      )}
      <SheetError error={error} />
      <Button
        disabled={profile !== null && !diaInRange}
        onClick={() =>
          onSave({
            ...settings,
            bolus_insulin_id: insulinId,
            insulin_action_minutes: profile && dia !== null ? dia : null,
          })
        }
      >
        {t(lang, "save")}
      </Button>
    </>
  );
}

function BasalEditor({
  lang,
  initial,
  error,
  onSave,
}: {
  lang: Language;
  initial: BasalInsulinId | null;
  error: string | null;
  onSave: (id: BasalInsulinId | null) => void;
}) {
  const [insulinId, setInsulinId] = useState(initial);
  return (
    <>
      <OptionList
        label={t(lang, "basalInsulin")}
        value={insulinId}
        options={basalInsulinProfiles().map((p) => ({
          value: p.id,
          title: p.brand_name,
          detail: p.generic_name,
        }))}
        onChange={setInsulinId}
      />
      <SheetError error={error} />
      <Button onClick={() => onSave(insulinId)}>{t(lang, "save")}</Button>
    </>
  );
}
