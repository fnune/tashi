import type { Profile, Settings } from "@tashi/shared";
import { activeProfile, NORMAL_PROFILE_ID } from "@tashi/shared";
import { useEffect, useId, useRef, useState } from "react";
import { type Language, t } from "../i18n.js";
import { profileIcon, profileName, profileSummary } from "../profileLabels.js";
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
  const [moreChips, setMoreChips] = useState({ start: false, end: false });

  useEffect(() => {
    const scroller = row.current;
    if (!scroller) return;
    const findHiddenChips = () => {
      const end = scroller.scrollWidth - scroller.clientWidth;
      setMoreChips({
        start: scroller.scrollLeft > 1,
        end: scroller.scrollLeft < end - 1,
      });
    };
    findHiddenChips();
    scroller.addEventListener("scroll", findHiddenChips, { passive: true });
    const observer = new ResizeObserver(findHiddenChips);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", findHiddenChips);
      observer.disconnect();
    };
  }, []);

  // Scrolls only the row: scrollIntoView would also move the page.
  useEffect(() => {
    const scroller = row.current;
    const chip = scroller?.querySelector<HTMLElement>(
      `[data-profile-id="${active.id}"]`,
    );
    if (!scroller || !chip) return;
    const start = chip.offsetLeft - scroller.offsetLeft;
    const fade = Number.parseFloat(
      getComputedStyle(scroller).getPropertyValue("--fade"),
    );
    const clear = (fade || 0) + 1;
    const visibleStart = scroller.scrollLeft + clear;
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth - clear;
    if (start < visibleStart || start + chip.offsetWidth > visibleEnd) {
      scroller.scrollTo({ left: Math.max(0, start - clear) });
    }
  }, [active.id]);

  return (
    <fieldset
      className={
        inline ? "profile-chips profile-chips-inline" : "profile-chips"
      }
    >
      <legend>{label ?? t(lang, "profilesTitle")}</legend>
      <div
        className="profile-chips-row"
        ref={row}
        data-more-start={moreChips.start || undefined}
        data-more-end={moreChips.end || undefined}
      >
        {settings.profiles.map((profile) => {
          const editable = onEdit && profile.id !== NORMAL_PROFILE_ID;
          const icon =
            profile.id === NORMAL_PROFILE_ID ? null : profileIcon(profile);
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
                {icon && <Icon name={icon} />}
                {profileName(profile, lang)}
                {profile.id !== NORMAL_PROFILE_ID && (
                  <small className="num">{profileSummary(profile, lang)}</small>
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
                  <Icon name="edit" />
                </button>
              )}
            </span>
          );
        })}
      </div>
    </fieldset>
  );
}
