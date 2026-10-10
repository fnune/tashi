import type { MealWindow, Profile, RatioFormat } from "@pincho/shared";
import { useId, useState } from "react";
import { type Language, t } from "../i18n.js";
import { profileName, signedPercent } from "../profileLabels.js";
import {
  formatRatio,
  parseRatioInput,
  ratioInputText,
  ratioUnit,
} from "../ratioLabels.js";
import { Button } from "./ui/Button.js";
import { NumberField, TextField } from "./ui/Field.js";
import { Notice } from "./ui/Notice.js";
import { Segmented } from "./ui/Segmented.js";
import { Stepper } from "./ui/Stepper.js";
import "./ProfileEditor.css";

const EMOJIS = ["🏃", "🤒", "🩸", "🏖️", "✈️", "😴", "🍕", "💊", "🌙", "⭐"];
const PERCENT_STEP = 5;
const MIN_PERCENT = -90;

type Mode = Profile["adjustment"]["mode"];

function savedRatios(profile: Profile): Record<string, number> {
  return profile.adjustment.mode === "per_window"
    ? profile.adjustment.ratios
    : {};
}

export function ProfileEditor({
  profile,
  isNew,
  ratioFormat,
  windows,
  lang,
  error,
  onSave,
  onDelete,
}: {
  profile: Profile;
  isNew: boolean;
  ratioFormat: RatioFormat;
  windows: MealWindow[];
  lang: Language;
  error: string | null;
  onSave: (profile: Profile) => void;
  onDelete?: () => void;
}) {
  const emojiGroup = useId();
  const [name, setName] = useState(
    profile.name || (isNew ? "" : profileName(profile, lang)),
  );
  const [emoji, setEmoji] = useState(profile.emoji);
  const [mode, setMode] = useState<Mode>(profile.adjustment.mode);
  const [percent, setPercent] = useState(
    profile.adjustment.mode === "percent" ? profile.adjustment.percent : 0,
  );
  const [ratioTexts, setRatioTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(savedRatios(profile)).map(([window, ratio]) => [
        window,
        ratioInputText(ratio, ratioFormat, lang),
      ]),
    ),
  );

  const parsedRatios = Object.entries(ratioTexts)
    .filter(([, text]) => text.trim() !== "")
    .map(
      ([window, text]) =>
        [
          window,
          parseRatioInput(
            text,
            ratioFormat,
            lang,
            savedRatios(profile)[window],
          ),
        ] as const,
    );
  const ratiosValid = parsedRatios.every(([, ratio]) => ratio !== null);

  function save() {
    onSave({
      ...profile,
      name: name.trim(),
      emoji,
      adjustment:
        mode === "percent"
          ? { mode, percent }
          : {
              mode,
              ratios: Object.fromEntries(
                parsedRatios.map(([window, ratio]) => [window, ratio ?? 0]),
              ),
            },
    });
  }

  return (
    <>
      <TextField label={t(lang, "mealName")} value={name} onChange={setName} />
      <fieldset className="emoji-picker">
        <legend>{t(lang, "profileIcon")}</legend>
        {(EMOJIS.includes(profile.emoji)
          ? EMOJIS
          : [profile.emoji, ...EMOJIS]
        ).map((option) => (
          <label key={option}>
            <input
              type="radio"
              className="visually-hidden"
              name={emojiGroup}
              checked={option === emoji}
              onChange={() => setEmoji(option)}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <div className="profile-editor-mode">
        <span>{t(lang, "adjustBy")}</span>
        <Segmented<Mode>
          label={t(lang, "adjustBy")}
          value={mode}
          options={[
            { value: "percent", label: t(lang, "byPercent") },
            { value: "per_window", label: t(lang, "byWindow") },
          ]}
          onChange={setMode}
        />
      </div>
      {mode === "percent" ? (
        <>
          <Stepper
            value={percent}
            step={PERCENT_STEP}
            min={MIN_PERCENT}
            unit=""
            format={signedPercent}
            decreaseLabel={t(lang, "percentLess").replace(
              "{step}",
              String(PERCENT_STEP),
            )}
            increaseLabel={t(lang, "percentMore").replace(
              "{step}",
              String(PERCENT_STEP),
            )}
            onChange={setPercent}
          />
          <p className="profile-editor-hint">{t(lang, "percentHint")}</p>
        </>
      ) : (
        <>
          {windows.map((window) => (
            <NumberField
              key={window.name}
              label={window.name || t(lang, "unnamedWindow")}
              unit={ratioUnit(ratioFormat, lang)}
              hint={`${t(lang, "profile_normal")}: ${formatRatio(window.ratio, ratioFormat, lang)}`}
              value={ratioTexts[window.name] ?? ""}
              onChange={(text) =>
                setRatioTexts({ ...ratioTexts, [window.name]: text })
              }
            />
          ))}
          <p className="profile-editor-hint">{t(lang, "perWindowHint")}</p>
        </>
      )}
      <p className="profile-editor-hint">{t(lang, "profilesNote")}</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button disabled={mode === "per_window" && !ratiosValid} onClick={save}>
        {t(lang, "save")}
      </Button>
      {onDelete && (
        <Button variant="danger" onClick={onDelete}>
          {t(lang, "deleteProfile")}
        </Button>
      )}
    </>
  );
}
