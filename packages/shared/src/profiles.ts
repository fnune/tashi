import type { AppliedProfile, MealWindow, Profile, Settings } from "./types.js";
import { NORMAL_PROFILE_ID } from "./types.js";

const NEUTRAL_PROFILE: Profile = {
  id: NORMAL_PROFILE_ID,
  name: "",
  emoji: "◎",
  adjustment: { mode: "percent", percent: 0 },
};

export function activeProfile(settings: Settings): Profile {
  return (
    settings.profiles.find((p) => p.id === settings.active_profile_id) ??
    settings.profiles.find((p) => p.id === NORMAL_PROFILE_ID) ??
    NEUTRAL_PROFILE
  );
}

export function effectiveRatio(profile: Profile, window: MealWindow): number {
  if (profile.adjustment.mode !== "per_window") return window.ratio;
  return profile.adjustment.ratios[window.name] ?? window.ratio;
}

export function unitsScale(profile: Profile): number {
  return profile.adjustment.mode === "percent"
    ? 1 + profile.adjustment.percent / 100
    : 1;
}

export function appliedProfile(profile: Profile): AppliedProfile {
  return {
    id: profile.id,
    name: profile.name,
    percent:
      profile.adjustment.mode === "percent" ? profile.adjustment.percent : 0,
  };
}

export function renameWindowInProfiles(
  profiles: Profile[],
  from: string,
  to: string,
): Profile[] {
  if (from === to) return profiles;
  return profiles.map((profile) => {
    if (profile.adjustment.mode !== "per_window") return profile;
    const { [from]: ratio, ...others } = profile.adjustment.ratios;
    if (ratio === undefined) return profile;
    return {
      ...profile,
      adjustment: { mode: "per_window", ratios: { ...others, [to]: ratio } },
    };
  });
}

export type RatioModifier =
  | { kind: "none" }
  | { kind: "percent"; percent: number }
  | { kind: "own" };

export interface WindowRatio {
  base: number;
  modifier: RatioModifier;
  result: number;
}

function ratioGivingSameMealUnits(base: number, profile: Profile): number {
  return base / unitsScale(profile);
}

export function windowRatio(profile: Profile, window: MealWindow): WindowRatio {
  const base = window.ratio;
  const adjustment = profile.adjustment;
  if (adjustment.mode === "percent") {
    if (adjustment.percent === 0) {
      return { base, modifier: { kind: "none" }, result: base };
    }
    return {
      base,
      modifier: { kind: "percent", percent: adjustment.percent },
      result: ratioGivingSameMealUnits(base, profile),
    };
  }
  const own = adjustment.ratios[window.name];
  if (own === undefined || own === base) {
    return { base, modifier: { kind: "none" }, result: base };
  }
  return { base, modifier: { kind: "own" }, result: own };
}
