import type {
  BasalInsulinId,
  BolusInsulinId,
  CalculatedItem,
  CalculationResult,
  FoodItem,
  FoodVocabEntry,
  ParseTrace,
  Settings,
  TimelineEntry,
} from "@tashi/shared";
import {
  basalInsulinProfiles,
  bolusInsulinProfiles,
  DATA_SOURCE_LABELS,
  DEFAULT_SETTINGS,
  FOOD_SOURCE_IDS,
  MAX_CYCLE_DAYS,
  MAX_DIA_MINUTES,
  MIN_CYCLE_DAYS,
  MIN_DIA_MINUTES,
  NORMAL_PROFILE_ID,
} from "@tashi/shared";
import { z } from "zod";

export const bolusInsulinIdSchema = z.enum(
  bolusInsulinProfiles().map((p) => p.id) as [
    BolusInsulinId,
    ...BolusInsulinId[],
  ],
);

export const basalInsulinIdSchema = z.enum(
  basalInsulinProfiles().map((p) => p.id) as [
    BasalInsulinId,
    ...BasalInsulinId[],
  ],
);

export const settingsSchema = z
  .object({
    meal_windows: z.array(
      z.object({
        name: z.string(),
        start_hour: z.number().min(0).max(23),
        end_hour: z.number().min(0).max(24),
        ratio: z.number().positive(),
      }),
    ),
    correction_factor: z.number().positive().nullable(),
    target_blood_sugar: z.number().positive(),
    glucose_unit: z.union([z.literal("mg/dL"), z.literal("mmol/L")]),
    ratio_format: z.enum(["grams_per_unit", "units_per_10g"]),
    pen_increment: z.union([z.literal(0.5), z.literal(1)]),
    fat_protein_multiplier: z.number().min(0).max(1),
    bolus_insulin_id: bolusInsulinIdSchema.nullable(),
    basal_insulin_id: basalInsulinIdSchema.nullable(),
    insulin_action_minutes: z
      .number()
      .min(MIN_DIA_MINUTES)
      .max(MAX_DIA_MINUTES)
      .nullable(),
    language: z.union([z.literal("en"), z.literal("es")]),
    profiles: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string(),
          emoji: z.string(),
          adjustment: z.discriminatedUnion("mode", [
            z.object({
              mode: z.literal("percent"),
              percent: z.number().min(-90).max(200),
            }),
            z.object({
              mode: z.literal("per_window"),
              ratios: z.record(z.string(), z.number().positive()),
            }),
          ]),
        }),
      )
      .refine((profiles) => profiles.some((p) => p.id === NORMAL_PROFILE_ID), {
        message: "The Normal profile cannot be removed",
      }),
    active_profile_id: z.string(),
    cycle: z.object({
      enabled: z.boolean(),
      last_period_start: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      length_days: z.number().int().min(MIN_CYCLE_DAYS).max(MAX_CYCLE_DAYS),
    }),
  })
  .refine((s) => s.profiles.some((p) => p.id === s.active_profile_id), {
    message: "The active profile must exist",
  }) satisfies z.ZodType<Settings>;

export function parseStoredSettings(stored: unknown): Settings {
  return settingsSchema.parse({
    ...DEFAULT_SETTINGS,
    ...z.record(z.string(), z.unknown()).parse(stored),
  });
}

export const glucoseUnitSchema = z.union([
  z.literal("mg/dL"),
  z.literal("mmol/L"),
]);
export const languageSchema = z.union([z.literal("en"), z.literal("es")]);
export const isoTimestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)));
const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

export const mealWindowSchema = z.object({
  name: z.string(),
  start_hour: z.number(),
  end_hour: z.number(),
  ratio: z.number().positive(),
});

export const foodItemSchema = z.object({
  fdc_id: z.number(),
  description: z.string(),
  data_type: z.string(),
  category: nullableString,
  net_carbs_per_100g: z.number(),
  total_carbs_per_100g: z.number(),
  fiber_per_100g: nullableNumber,
  sugars_per_100g: nullableNumber,
  fat_per_100g: nullableNumber,
  protein_per_100g: nullableNumber,
  serving_g: nullableNumber,
  serving_desc: nullableString,
  name_es: nullableString,
  glycemic_index: nullableNumber,
  gi_source: nullableString,
  cooking_multiplier: nullableNumber,
}) satisfies z.ZodType<FoodItem>;

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const calculatedItemSchema = z.object({
  description: z.string(),
  weight_g: z.number(),
  net_carbs_per_100g: z.number(),
  net_carbs_g: z.number(),
  fat_per_100g: z.number(),
  protein_per_100g: z.number(),
  fat_g: z.number(),
  protein_g: z.number(),
  assumed_cooked: z.boolean(),
  confidence: confidenceSchema,
  notes: nullableString,
  warning: nullableString,
  data_source: z.enum(DATA_SOURCE_LABELS),
  estimated: z.boolean(),
  glycemic_index: nullableNumber,
  gi_estimated: z.boolean(),
  food_item: foodItemSchema.nullable(),
}) satisfies z.ZodType<CalculatedItem>;

export const parseTraceSchema = z.object({
  searches: z.array(
    z.object({
      query: z.string(),
      results: z.array(
        z.object({
          fdc_id: z.number(),
          description: z.string(),
          net_carbs_per_100g: z.number(),
        }),
      ),
    }),
  ),
  raw_response: z.string(),
  model: z.string(),
  duration_ms: z.number(),
}) satisfies z.ZodType<ParseTrace>;

export const correctionSchema = z.object({
  current_blood_sugar: z.number(),
  target_blood_sugar: z.number(),
  correction_factor: z.number(),
  correction_units: z.number(),
  iob: z.number(),
  iob_reduction: z.number(),
  total_units: z.number(),
}) satisfies z.ZodType<NonNullable<CalculationResult["correction"]>>;

export const fatProteinAdjustmentSchema = z.object({
  total_fat_g: z.number(),
  total_protein_g: z.number(),
  threshold_met: z.string(),
  multiplier: z.number(),
  adjustment_units: z.number(),
  total_units: z.number(),
}) satisfies z.ZodType<
  NonNullable<CalculationResult["fat_protein_adjustment"]>
>;

export const timeZoneSchema = z.string().refine((zone) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}, "not a time zone");

export const entryBase = {
  id: z.string().uuid(),
  timestamp: isoTimestampSchema,
  time_zone: timeZoneSchema,
};

export const storedTimelineSchema = z.array(
  z.discriminatedUnion("type", [
    z.object({
      ...entryBase,
      type: z.literal("meal"),
      input_text: z.string(),
      language: languageSchema,
      meal_window: mealWindowSchema,
      items: z.array(calculatedItemSchema),
      total_net_carbs_g: z.number(),
      carb_units: z.number(),
      total_units: z.number(),
      correction: correctionSchema.optional(),
      fat_protein_adjustment: fatProteinAdjustmentSchema.optional(),
      trace: parseTraceSchema.optional(),
    }),
    z.object({
      ...entryBase,
      type: z.literal("fast_insulin"),
      units: z.number(),
      insulin_id: bolusInsulinIdSchema,
      related_meal_id: nullableString,
    }),
    z.object({
      ...entryBase,
      type: z.literal("slow_insulin"),
      units: z.number(),
      insulin_id: basalInsulinIdSchema,
    }),
    z.object({
      ...entryBase,
      type: z.literal("glucose_reading"),
      value: z.number(),
      unit: glucoseUnitSchema,
    }),
  ]),
) satisfies z.ZodType<TimelineEntry[]>;

export const storedVocabularySchema = z.array(
  z.object({
    description: z.string(),
    source: z.enum(FOOD_SOURCE_IDS),
    fdc_id: z.number(),
    catalog_name: z.string(),
    default_weight_g: z.number(),
    use_count: z.number(),
    last_used: z.string(),
  }),
) satisfies z.ZodType<FoodVocabEntry[]>;
