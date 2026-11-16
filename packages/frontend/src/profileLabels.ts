import type { Profile } from "@tashi/shared";
import type { IconName } from "./components/ui/Icon.js";
import type { Language, TranslationKey } from "./i18n.js";
import { t } from "./i18n.js";

// Stored in `Profile.emoji`, which held emoji before the design system.
export const PROFILE_ICONS = [
  "run",
  "thermo",
  "drop",
  "sun",
  "plane",
  "moon",
  "meal",
  "pill",
  "star",
] as const satisfies readonly IconName[];

export type ProfileIconName = (typeof PROFILE_ICONS)[number];

const LEGACY_EMOJI: Record<string, ProfileIconName> = {
  "🏃": "run",
  "🤒": "thermo",
  "🩸": "drop",
  "🏖️": "sun",
  "✈️": "plane",
  "😴": "moon",
  "🌙": "moon",
  "🍕": "meal",
  "💊": "pill",
  "⭐": "star",
};

export function profileIcon(
  profile: Pick<Profile, "emoji">,
): ProfileIconName | null {
  const stored = profile.emoji;
  if ((PROFILE_ICONS as readonly string[]).includes(stored)) {
    return stored as ProfileIconName;
  }
  return LEGACY_EMOJI[stored] ?? null;
}

export function profileRaisesUnits(profile: Profile): boolean {
  return (
    profile.adjustment.mode === "percent" && profile.adjustment.percent > 0
  );
}

const SEEDED_NAMES: Record<string, TranslationKey> = {
  normal: "profile_normal",
  sport: "profile_sport",
  sick: "profile_sick",
  menstruation: "profile_menstruation",
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
  if (percent === 0) return "0\u00a0%";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)}\u00a0%`;
}

export function profileSummary(profile: Profile, lang: Language): string {
  return profile.adjustment.mode === "percent"
    ? signedPercent(profile.adjustment.percent)
    : t(lang, "byWindow");
}
