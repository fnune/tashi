import type { Settings } from "@pincho/shared";
import { activeProfile, NORMAL_PROFILE_ID } from "@pincho/shared";
import { useId } from "react";
import { type Language, t } from "../i18n.js";
import { profileName, profileSummary } from "../profileLabels.js";
import "./ProfileChips.css";

export function ProfileChips({
  id,
  settings,
  lang,
  onSelect,
}: {
  id?: string;
  settings: Settings;
  lang: Language;
  onSelect: (profileId: string) => void;
}) {
  const name = useId();
  const active = activeProfile(settings);
  return (
    <fieldset id={id} className="profile-chips">
      <legend>{t(lang, "profilesTitle")}</legend>
      <div className="profile-chips-row">
        {settings.profiles.map((profile) => (
          <label key={profile.id} className="profile-chip">
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={profile.id === active.id}
              onChange={() => onSelect(profile.id)}
            />
            {profile.id !== NORMAL_PROFILE_ID && (
              <span aria-hidden="true">{profile.emoji}</span>
            )}
            {profileName(profile, lang)}
            {profile.id !== NORMAL_PROFILE_ID && (
              <small>{profileSummary(profile, lang)}</small>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
