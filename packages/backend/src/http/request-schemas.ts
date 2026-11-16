import type {
  ImportEntriesRequest,
  StartImportRequest,
  UpdateTimelineRequest,
} from "@tashi/shared";
import { IMPORT_ENTRIES_PER_REQUEST, isPlausibleGlucose } from "@tashi/shared";
import { z } from "zod";
import {
  calculatedItemSchema,
  correctionSchema,
  fatProteinAdjustmentSchema,
  isoTimestampSchema,
  languageSchema,
  mealWindowSchema,
  parseTraceSchema,
  settingsSchema,
  storedTimelineSchema,
  storedVocabularySchema,
} from "../domain/schemas.js";

export const calculateSchema = z.object({
  food_description: z.string().min(1),
  current_blood_sugar: z.number().positive().optional(),
  meal_window_override: z.string().optional(),
});

export const connectAiSchema = z.object({
  api_key: z
    .string()
    .trim()
    .min(1)
    .refine((key) => !/\s/.test(key)),
  model: z.string().optional(),
});

export const chooseAiModelSchema = z.object({ model: z.string() });

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

export const logMealSchema = z.object({
  result: z.object({
    input_text: z.string(),
    language: languageSchema,
    meal_window: mealWindowSchema,
    items: z.array(calculatedItemSchema),
    total_net_carbs_g: z.number(),
    carb_dose: z.number(),
    total_dose: z.number().min(0),
    correction: correctionSchema.optional(),
    fat_protein_adjustment: fatProteinAdjustmentSchema.optional(),
    trace: parseTraceSchema.optional(),
  }),
  units: z.number().min(0),
  pre_bolus_minutes: z.number().int().min(0).max(60).default(0),
  injected_at: isoTimestampSchema.optional(),
});

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

export const startImportSchema = z.object({
  settings: settingsSchema,
  vocabulary: storedVocabularySchema,
}) satisfies z.ZodType<StartImportRequest>;

export const importEntriesSchema = z.object({
  entries: storedTimelineSchema.max(IMPORT_ENTRIES_PER_REQUEST),
}) satisfies z.ZodType<ImportEntriesRequest>;
