import type { FastInsulinEntry, Settings } from "./types.js";

export interface SourceRef {
  label: string;
  url: string;
}

export type BolusInsulinId = "novorapid";
export type BasalInsulinId = "lantus" | "levemir" | "tresiba";
export type InsulinId = BolusInsulinId | BasalInsulinId;

export type InsulinRole = "bolus" | "basal";

export interface InsulinActionModel {
  kind: "exponential";
  peak_minutes: number;
  duration_minutes: number;
  sources: SourceRef[];
}

interface InsulinProfileBase {
  brand_name: string;
  generic_name: string;
  label_source: SourceRef;
}

export interface BolusInsulinProfile extends InsulinProfileBase {
  id: BolusInsulinId;
  role: "bolus";
  action: InsulinActionModel;
}

export interface BasalInsulinProfile extends InsulinProfileBase {
  id: BasalInsulinId;
  role: "basal";
  action: null;
}

export type InsulinProfile = BolusInsulinProfile | BasalInsulinProfile;

const NOVORAPID_SMPC: SourceRef = {
  label:
    "NovoRapid FlexPen SmPC (EMA/emc) §5.1: onset 10-20 min, max effect 1-3 h, duration 3-5 h",
  url: "https://www.medicines.org.uk/emc/product/7920/smpc",
};

const WOODWORTH_PD_MODEL: SourceRef = {
  label:
    "Woodworth et al., Establishment of Time-Action Profiles for Regular and NPH Insulin Using Pharmacodynamic Modeling, Diabetes Care 1994;17(1):64 — effect-compartment exponential activity model",
  url: "https://diabetesjournals.org/care/article/17/1/64/17204",
};

const WALSH_DIA: SourceRef = {
  label:
    "Walsh, Roberts, Heinemann, Confusion Regarding Duration of Insulin Action, J Diabetes Sci Technol 2014;8(1):170 — rapid-analog bolus IOB lasts >5 h; short DIA causes stacking",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4454113/",
};

const NOVOLOG_FDA_LABEL: SourceRef = {
  label: "NovoLog (insulin aspart) FDA label §12.3: median Tmax 40-50 min",
  url: "https://www.accessdata.fda.gov/drugsatfda_docs/label/2015/020986s082lbl.pdf",
};

const LANTUS_SMPC: SourceRef = {
  label: "Lantus SmPC (EMA/emc): insulin glargine, duration up to 24 h",
  url: "https://www.medicines.org.uk/emc/product/2376/smpc",
};

const LEVEMIR_SMPC: SourceRef = {
  label: "Levemir SmPC (EMA/emc): insulin detemir",
  url: "https://www.medicines.org.uk/emc/product/4880/smpc",
};

const TRESIBA_SMPC: SourceRef = {
  label: "Tresiba SmPC (EMA/emc): insulin degludec, duration beyond 42 h",
  url: "https://www.medicines.org.uk/emc/product/5132/smpc",
};

export const NOVORAPID: BolusInsulinProfile = {
  id: "novorapid",
  brand_name: "NovoRapid",
  generic_name: "insulin aspart",
  role: "bolus",
  label_source: NOVORAPID_SMPC,
  action: {
    kind: "exponential",
    // Peak glucose-lowering activity, near the start of the SmPC's 1-3 h
    // "maximum effect" window. Deliberately later than the ~40-50 min PK Tmax
    // (NOVOLOG_FDA_LABEL): effect lags concentration, and IOB tracks effect.
    peak_minutes: 75,
    // SmPC duration is 3-5 h; we take the 5 h upper bound on purpose, matching
    // Walsh 2014's >5 h finding. A longer DIA slightly over-reports IOB, which
    // is the safe direction for stacking.
    duration_minutes: 300,
    sources: [WOODWORTH_PD_MODEL, WALSH_DIA, NOVORAPID_SMPC, NOVOLOG_FDA_LABEL],
  },
};

export const LANTUS: BasalInsulinProfile = {
  id: "lantus",
  brand_name: "Lantus",
  generic_name: "insulin glargine",
  role: "basal",
  action: null,
  label_source: LANTUS_SMPC,
};

export const LEVEMIR: BasalInsulinProfile = {
  id: "levemir",
  brand_name: "Levemir",
  generic_name: "insulin detemir",
  role: "basal",
  action: null,
  label_source: LEVEMIR_SMPC,
};

export const TRESIBA: BasalInsulinProfile = {
  id: "tresiba",
  brand_name: "Tresiba",
  generic_name: "insulin degludec",
  role: "basal",
  action: null,
  label_source: TRESIBA_SMPC,
};

export const INSULIN_CATALOG: Record<string, InsulinProfile> = {
  novorapid: NOVORAPID,
  lantus: LANTUS,
  levemir: LEVEMIR,
  tresiba: TRESIBA,
};

export const MIN_DIA_MINUTES = 180;
export const MAX_DIA_MINUTES = 360;

export function getInsulinProfile(id: string): InsulinProfile {
  const profile = INSULIN_CATALOG[id];
  if (!profile) {
    throw new Error(`Unknown insulin id: ${JSON.stringify(id)}`);
  }
  return profile;
}

export function getBolusInsulinProfile(id: string): BolusInsulinProfile {
  const profile = getInsulinProfile(id);
  if (profile.role !== "bolus") {
    throw new Error(`Insulin ${id} is ${profile.role}, not bolus`);
  }
  return profile;
}

export function getBasalInsulinProfile(id: string): BasalInsulinProfile {
  const profile = getInsulinProfile(id);
  if (profile.role !== "basal") {
    throw new Error(`Insulin ${id} is ${profile.role}, not basal`);
  }
  return profile;
}

export function bolusInsulinProfiles(): BolusInsulinProfile[] {
  return Object.values(INSULIN_CATALOG).filter(
    (p): p is BolusInsulinProfile => p.role === "bolus",
  );
}

export function basalInsulinProfiles(): BasalInsulinProfile[] {
  return Object.values(INSULIN_CATALOG).filter(
    (p): p is BasalInsulinProfile => p.role === "basal",
  );
}

export function effectiveBolusModel(settings: Settings): InsulinActionModel {
  if (settings.bolus_insulin_id === null) {
    throw new Error("No bolus insulin configured");
  }
  if (settings.insulin_action_minutes === null) {
    throw new Error("No duration of insulin action configured");
  }
  const profile = getBolusInsulinProfile(settings.bolus_insulin_id);
  return {
    ...profile.action,
    duration_minutes: settings.insulin_action_minutes,
  };
}

export function insulinRemainingFraction(
  elapsedMinutes: number,
  peakMinutes: number,
  durationMinutes: number,
): number {
  if (elapsedMinutes <= 0) return 1;
  if (elapsedMinutes >= durationMinutes) return 0;

  const td = durationMinutes;
  const tp = peakMinutes;
  const tau = (tp * (1 - tp / td)) / (1 - (2 * tp) / td);
  const a = (2 * tau) / td;
  const s = 1 / (1 - a + (1 + a) * Math.exp(-td / tau));

  const t = elapsedMinutes;
  const inner =
    ((t * t) / (tau * td * (1 - a)) - t / tau - 1) * Math.exp(-t / tau) + 1;
  return 1 - s * (1 - a) * inner;
}

export interface IobContribution {
  entry_id: string;
  insulin_id: string;
  units: number;
  injected_at: string;
  minutes_elapsed: number;
  fraction_remaining: number;
  units_remaining: number;
}

export interface InsulinOnBoard {
  at: string;
  total_units: number;
  contributions: IobContribution[];
}

export function insulinOnBoard(
  entries: FastInsulinEntry[],
  settings: Settings,
  now: Date,
): InsulinOnBoard {
  if (settings.insulin_action_minutes === null) {
    throw new Error("No duration of insulin action configured");
  }
  const durationMinutes = settings.insulin_action_minutes;
  const contributions: IobContribution[] = [];

  for (const entry of entries) {
    const minutesElapsed =
      (now.getTime() - new Date(entry.timestamp).getTime()) / 60_000;
    if (minutesElapsed < 0 || minutesElapsed >= durationMinutes) continue;

    const profile = getBolusInsulinProfile(entry.insulin_id);
    const fraction = insulinRemainingFraction(
      minutesElapsed,
      profile.action.peak_minutes,
      durationMinutes,
    );

    contributions.push({
      entry_id: entry.id,
      insulin_id: profile.id,
      units: entry.units,
      injected_at: entry.timestamp,
      minutes_elapsed: minutesElapsed,
      fraction_remaining: fraction,
      units_remaining: entry.units * fraction,
    });
  }

  const total = contributions.reduce((sum, c) => sum + c.units_remaining, 0);
  return {
    at: now.toISOString(),
    total_units: total,
    contributions,
  };
}
