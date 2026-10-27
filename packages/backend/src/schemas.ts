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
  UpdateTimelineRequest,
} from "@tashi/shared";
import {
  basalInsulinProfiles,
  bolusInsulinProfiles,
  isPlausibleGlucose,
  MAX_CYCLE_DAYS,
  MAX_DIA_MINUTES,
  MIN_CYCLE_DAYS,
  MIN_DIA_MINUTES,
  NORMAL_PROFILE_ID,
} from "@tashi/shared";
import { z } from "zod";
import type { SealedSecret } from "./secret-box.js";

export const calculateSchema = z.object({
  food_description: z.string().min(1),
  current_blood_sugar: z.number().positive().optional(),
  meal_window_override: z.string().optional(),
});

export const apiKeySchema = z.object({
  api_key: z
    .string()
    .trim()
    .min(1)
    .refine((key) => !/\s/.test(key)),
});

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

export const createTimelineSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("fast_insulin"),
      units: z.number().positive(),
    }),
    z.object({
      type: z.literal("slow_insulin"),
      units: z.number().positive(),
    }),
    z.object({
      type: z.literal("glucose_reading"),
      value: z.number().positive(),
      unit: z.union([z.literal("mg/dL"), z.literal("mmol/L")]),
    }),
  ])
  .refine(
    (entry) =>
      entry.type !== "glucose_reading" ||
      isPlausibleGlucose(entry.value, entry.unit),
  );

const glucoseUnitSchema = z.union([z.literal("mg/dL"), z.literal("mmol/L")]);
const languageSchema = z.union([z.literal("en"), z.literal("es")]);
const isoTimestampSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)));
const nullableNumber = z.number().nullable();
const nullableString = z.string().nullable();

const mealWindowSchema = z.object({
  name: z.string(),
  start_hour: z.number(),
  end_hour: z.number(),
  ratio: z.number().positive(),
});

const foodItemSchema = z.object({
  fdc_id: z.number(),
  description: z.string(),
  data_type: z.string(),
  category: nullableString,
  net_carbs_per_100g: z.number(),
  total_carbs_per_100g: z.number(),
  fiber_per_100g: z.number(),
  sugars_per_100g: z.number(),
  fat_per_100g: z.number(),
  protein_per_100g: z.number(),
  serving_g: nullableNumber,
  serving_desc: nullableString,
  name_es: nullableString,
  glycemic_index: nullableNumber,
  gi_source: nullableString,
  cooking_multiplier: nullableNumber,
}) satisfies z.ZodType<FoodItem>;

const confidenceSchema = z.enum(["high", "medium", "low"]);

const calculatedItemSchema = z.object({
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
  data_source: z.string(),
  estimated: z.boolean(),
  glycemic_index: nullableNumber,
  gi_estimated: z.boolean(),
  food_item: foodItemSchema.nullable(),
}) satisfies z.ZodType<CalculatedItem>;

const parseTraceSchema = z.object({
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

const appliedProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  percent: z.number(),
});

const correctionSchema = z.object({
  current_blood_sugar: z.number(),
  target_blood_sugar: z.number(),
  correction_factor: z.number(),
  correction_dose: z.number(),
  iob: z.number(),
  iob_reduction: z.number(),
  total_dose: z.number(),
}) satisfies z.ZodType<NonNullable<CalculationResult["correction"]>>;

const fatProteinAdjustmentSchema = z.object({
  total_fat_g: z.number(),
  total_protein_g: z.number(),
  threshold_met: z.string(),
  multiplier: z.number(),
  adjustment_dose: z.number(),
  total_dose: z.number(),
}) satisfies z.ZodType<
  NonNullable<CalculationResult["fat_protein_adjustment"]>
>;

export const logMealSchema = z.object({
  result: z.object({
    input_text: z.string(),
    language: languageSchema,
    meal_window: mealWindowSchema,
    items: z.array(calculatedItemSchema),
    total_net_carbs_g: z.number(),
    recommended_dose: z.number(),
    correction: correctionSchema.optional(),
    fat_protein_adjustment: fatProteinAdjustmentSchema.optional(),
    trace: parseTraceSchema.optional(),
  }),
  units: z.number().min(0),
  pre_bolus_minutes: z.number().int().min(0).max(60).default(0),
});

const entryBase = { id: z.string().min(1), timestamp: isoTimestampSchema };

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
      recommended_dose: z.number().optional(),
      total_dose: z.number().optional(),
      profile: appliedProfileSchema.optional(),
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

export const updateTimelineSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("meal"),
    timestamp: isoTimestampSchema.optional(),
  }),
  z.object({
    type: z.literal("fast_insulin"),
    timestamp: isoTimestampSchema.optional(),
    units: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal("slow_insulin"),
    timestamp: isoTimestampSchema.optional(),
    units: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal("glucose_reading"),
    timestamp: isoTimestampSchema.optional(),
    value: z.number().positive().optional(),
  }),
]) satisfies z.ZodType<UpdateTimelineRequest>;

export const storedVocabularySchema = z.array(
  z.object({
    description: z.string(),
    fdc_id: z.number(),
    usda_description: z.string(),
    default_weight_g: z.number(),
    use_count: z.number(),
    last_used: z.string(),
  }),
) satisfies z.ZodType<FoodVocabEntry[]>;

export const sealedSecretSchema = z.object({
  salt: z.string(),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
}) satisfies z.ZodType<SealedSecret>;
