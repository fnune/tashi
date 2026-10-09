import type { Profile } from "@pincho/shared";
import type { Language, TranslationKey } from "./i18n.js";
import { t } from "./i18n.js";

const SEEDED_NAMES: Record<string, TranslationKey> = {
  normal: "profile_normal",
  sport: "profile_sport",
  sick: "profile_sick",
};

export function profileName(
  profile: Pick<Profile, "id" | "name">,
  lang: Language,
): string {
  if (profile.name) return profile.name;
  const seeded = SEEDED_NAMES[profile.id];
  return seeded ? t(lang, seeded) : t(lang, "unnamedProfile");
}

export function signedPercent(percent: number): string {
  if (percent === 0) return "0 %";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)} %`;
}

export function profileSummary(profile: Profile, lang: Language): string {
  return profile.adjustment.mode === "percent"
    ? signedPercent(profile.adjustment.percent)
    : t(lang, "byWindow");
}
