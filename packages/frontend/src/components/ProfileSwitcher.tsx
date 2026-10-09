import type { CyclePhase, Settings } from "@pincho/shared";
import { activeProfile, NORMAL_PROFILE_ID } from "@pincho/shared";
import { Link } from "react-router";
import { type Language, t } from "../i18n.js";
import { profileName, profileSummary } from "../profileLabels.js";
import { OptionList } from "./ui/OptionList.js";

const MENSTRUATION_PROFILE_ID = "menstruation";

export function ProfileSwitcher({
  settings,
  lang,
  phase,
  onSelect,
}: {
  settings: Settings;
  lang: Language;
  phase: CyclePhase;
  onSelect: (profileId: string) => void;
}) {
  const suggestedId =
    phase === "luteal" ? MENSTRUATION_PROFILE_ID : NORMAL_PROFILE_ID;
  const suggestionMissing = !settings.profiles.some(
    (p) => p.id === suggestedId,
  );
  return (
    <>
      <p className="profile-switcher-reason">
        {t(
          lang,
          phase === "luteal" ? "switchProfileLuteal" : "switchProfilePeriod",
        )}
      </p>
      <OptionList
        label={t(lang, "profilesTitle")}
        value={activeProfile(settings).id}
        options={settings.profiles.map((profile) => ({
          value: profile.id,
          title: `${profile.emoji} ${profileName(profile, lang)}`,
          detail:
            profile.id === suggestedId
              ? `${profileSummary(profile, lang)} · ${t(lang, "suggested")}`
              : profileSummary(profile, lang),
        }))}
        onChange={onSelect}
      />
      {suggestionMissing && (
        <Link
          to="/settings?newProfile=menstruation"
          className="profile-switcher-create"
        >
          + {t(lang, "createMenstruationProfile")}
        </Link>
      )}
    </>
  );
}
