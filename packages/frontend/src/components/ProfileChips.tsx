import type { Profile, Settings } from "@pincho/shared";
import { activeProfile, NORMAL_PROFILE_ID } from "@pincho/shared";
import { useEffect, useId, useRef } from "react";
import { type Language, t } from "../i18n.js";
import { profileName, profileSummary } from "../profileLabels.js";
import { Icon } from "./ui/Icon.js";
import "./ProfileChips.css";

export function ProfileChips({
  settings,
  lang,
  label,
  inline = false,
  onSelect,
  onEdit,
}: {
  settings: Settings;
  label?: string;
  inline?: boolean;
  onEdit?: (profile: Profile) => void;
  lang: Language;
  onSelect: (profileId: string) => void;
}) {
  const name = useId();
  const active = activeProfile(settings);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = row.current;
    const chip = scroller?.querySelector<HTMLElement>(
      `[data-profile-id="${active.id}"]`,
    );
    if (!scroller || !chip) return;
    const chipEnd = chip.offsetLeft + chip.offsetWidth;
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth;
    if (chip.offsetLeft < scroller.scrollLeft || chipEnd > visibleEnd) {
      const padding = Number.parseFloat(getComputedStyle(scroller).paddingLeft);
      scroller.scrollTo({
        left: chip.offsetLeft - scroller.offsetLeft - padding,
      });
    }
  }, [active.id]);
  return (
    <fieldset
      className={
        inline ? "profile-chips profile-chips-inline" : "profile-chips"
      }
    >
      <legend>{label ?? t(lang, "profilesTitle")}</legend>
      <div className="profile-chips-row" ref={row}>
        {settings.profiles.map((profile) => {
          const editable = onEdit && profile.id !== NORMAL_PROFILE_ID;
          return (
            <span
              key={profile.id}
              className="profile-chip"
              data-profile-id={profile.id}
              data-editable={editable || undefined}
            >
              <label className="profile-chip-select">
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
              {editable && (
                <button
                  type="button"
                  className="profile-chip-edit"
                  aria-label={t(lang, "editProfileNamed").replace(
                    "{name}",
                    profileName(profile, lang),
                  )}
                  onClick={() => onEdit(profile)}
                >
                  <Icon name="pen" size="sm" />
                </button>
              )}
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
