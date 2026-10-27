import type {
  CalculatedItem,
  FastInsulinEntry,
  FoodItem,
  FoodSourceId,
  GlucoseEntry,
  GlucoseUnit,
  MealEntry,
  SlowInsulinEntry,
  TimelineEntry,
} from "@tashi/shared";
import {
  dataSourceOfFoodSource,
  FOOD_SOURCES,
  foodSourceOfDataSource,
  roundToIncrement,
} from "@tashi/shared";
import { sql } from "kysely";
import type { IdGenerator } from "../../domain/ids.js";
import type {
  TimelineCursor,
  TimelinePage,
  TimelineRepository,
} from "../../domain/repositories.js";
import { storedTimelineSchema } from "../../domain/schemas.js";
import { StoredDataError } from "../stored-data-error.js";
import type { Db, Executor } from "./connection.js";
import { fromMgDl, toMgDl } from "./glucose-units.js";

const entrySchema = storedTimelineSchema.element;

interface TimelineRow {
  id: string;
  kind: TimelineEntry["type"];
  occurred_at: Date;
  occurred_tz: string;
}

interface Display {
  unit: GlucoseUnit;
  penIncrement: 0.5 | 1;
}

export class PostgresTimelineRepository implements TimelineRepository {
  constructor(
    private db: Db,
    private newId: IdGenerator,
    private catalogRelease: number,
  ) {}

  async page(options: {
    before?: TimelineCursor;
    limit: number;
  }): Promise<TimelinePage> {
    const { before, limit } = options;
    const result = await sql<TimelineRow>`
      SELECT id, kind, occurred_at, occurred_tz FROM timeline
      WHERE ${
        before
          ? sql`(occurred_at, id) < (${before.occurredAt}::timestamptz, ${before.id}::uuid)`
          : sql`true`
      }
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limit + 1}`.execute(this.db);
    const rows = result.rows;
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      entries: await this.hydrate(this.db, pageRows),
      next:
        rows.length > limit && last
          ? { occurredAt: last.occurred_at.toISOString(), id: last.id }
          : null,
    };
  }

  async since(instant: Date): Promise<TimelineEntry[]> {
    const result = await sql<TimelineRow>`
      SELECT id, kind, occurred_at, occurred_tz FROM timeline
      WHERE occurred_at >= ${instant}
      ORDER BY occurred_at DESC, id DESC`.execute(this.db);
    return this.hydrate(this.db, result.rows);
  }

  async get(id: string): Promise<TimelineEntry | null> {
    if (!isUuid(id)) return null;
    const result = await sql<TimelineRow>`
      SELECT id, kind, occurred_at, occurred_tz FROM timeline WHERE id = ${id}::uuid`.execute(
      this.db,
    );
    const [entry] = await this.hydrate(this.db, result.rows);
    return entry ?? null;
  }

  async add(entries: TimelineEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.transaction().execute(async (trx) => {
      const display = await displayOf(trx);
      for (const entry of entries) {
        await this.insert(trx, entry, display);
      }
    });
  }

  async replace(entry: TimelineEntry): Promise<boolean> {
    if (!isUuid(entry.id)) return false;
    return this.db.transaction().execute(async (trx) => {
      const moment = {
        occurred_at: entry.timestamp,
        occurred_tz: entry.time_zone,
      };
      switch (entry.type) {
        case "glucose_reading": {
          const result = await trx
            .updateTable("glucose_entries")
            .set({
              ...moment,
              glucose_mg_dl: toMgDl(entry.value, entry.unit),
            })
            .where("id", "=", entry.id)
            .executeTakeFirst();
          return result.numUpdatedRows > 0n;
        }
        case "slow_insulin": {
          const result = await trx
            .updateTable("slow_insulin_entries")
            .set({
              ...moment,
              insulin: entry.insulin_id,
              insulin_units: entry.units,
            })
            .where("id", "=", entry.id)
            .executeTakeFirst();
          return result.numUpdatedRows > 0n;
        }
        case "fast_insulin": {
          const result = await trx
            .updateTable("fast_insulin_entries")
            .set({
              ...moment,
              insulin: entry.insulin_id,
              insulin_units: entry.units,
              meal_entry_id: entry.related_meal_id,
            })
            .where("id", "=", entry.id)
            .executeTakeFirst();
          return result.numUpdatedRows > 0n;
        }
        case "meal": {
          const result = await trx
            .updateTable("meal_entries")
            .set(moment)
            .where("id", "=", entry.id)
            .executeTakeFirst();
          return result.numUpdatedRows > 0n;
        }
      }
    });
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    return this.db.transaction().execute(async (trx) => {
      for (const table of [
        "glucose_entries",
        "slow_insulin_entries",
        "fast_insulin_entries",
        "meal_entries",
      ] as const) {
        const result = await trx
          .deleteFrom(table)
          .where("id", "=", id)
          .executeTakeFirst();
        if (result.numDeletedRows > 0n) return true;
      }
      return false;
    });
  }

  async clear(): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom("glucose_entries").execute();
      await trx.deleteFrom("slow_insulin_entries").execute();
      await trx.deleteFrom("fast_insulin_entries").execute();
      await trx.deleteFrom("meal_entries").execute();
    });
  }

  private async insert(
    trx: Executor,
    entry: TimelineEntry,
    display: Display,
  ): Promise<void> {
    const moment = {
      id: entry.id,
      occurred_at: entry.timestamp,
      occurred_tz: entry.time_zone,
    };
    switch (entry.type) {
      case "glucose_reading":
        await trx
          .insertInto("glucose_entries")
          .values({
            ...moment,
            glucose_mg_dl: toMgDl(entry.value, entry.unit),
          })
          .execute();
        return;
      case "slow_insulin":
        await trx
          .insertInto("slow_insulin_entries")
          .values({
            ...moment,
            insulin: entry.insulin_id,
            action: "basal",
            insulin_units: entry.units,
          })
          .execute();
        return;
      case "fast_insulin":
        await trx
          .insertInto("fast_insulin_entries")
          .values({
            ...moment,
            insulin: entry.insulin_id,
            action: "bolus",
            insulin_units: entry.units,
            meal_entry_id: entry.related_meal_id,
          })
          .execute();
        return;
      case "meal":
        await this.insertMeal(trx, entry, display);
    }
  }

  private async insertMeal(
    trx: Executor,
    meal: MealEntry,
    display: Display,
  ): Promise<void> {
    const ratioVersionId = await this.ratioVersion(trx, meal);
    await trx
      .insertInto("meal_entries")
      .values({
        id: meal.id,
        occurred_at: meal.timestamp,
        occurred_tz: meal.time_zone,
        input_text: meal.input_text,
        input_language: meal.language,
        ratio_version_id: ratioVersionId,
        total_carbs_g: meal.total_net_carbs_g,
        carb_dose_units: meal.recommended_dose,
        total_dose_units: meal.total_dose,
        catalog_release: this.catalogRelease,
      })
      .execute();

    if (meal.items.length > 0) {
      await trx
        .insertInto("meal_items")
        .values(
          meal.items.map((item, position) => {
            const source = foodSourceOfDataSource(item.data_source);
            if (item.estimated !== FOOD_SOURCES[source].estimate) {
              throw new Error(
                `Item "${item.description}" disagrees with its source ${source} about being an estimate`,
              );
            }
            return {
              meal_entry_id: meal.id,
              position,
              description: item.description,
              weight_g: item.weight_g,
              assumed_cooked: item.assumed_cooked,
              confidence: item.confidence,
              source,
              carbs_per_100g: item.net_carbs_per_100g,
              carbs_g: item.net_carbs_g,
              fat_per_100g: item.fat_per_100g,
              fat_g: item.fat_g,
              protein_per_100g: item.protein_per_100g,
              protein_g: item.protein_g,
              glycemic_index: item.glycemic_index,
              gi_estimated: item.gi_estimated,
              notes: item.notes,
              warning: item.warning,
              external_id: item.food_item ? String(item.food_item.fdc_id) : null,
              food_snapshot: item.food_item
                ? JSON.stringify(item.food_item)
                : null,
            };
          }),
        )
        .execute();
    }

    const unit = display.unit;
    if (meal.correction) {
      const c = meal.correction;
      await trx
        .insertInto("meal_corrections")
        .values({
          meal_entry_id: meal.id,
          current_glucose_mg_dl: toMgDl(c.current_blood_sugar, unit),
          target_glucose_mg_dl: toMgDl(c.target_blood_sugar, unit),
          glucose_drop_mg_dl_per_unit: toMgDl(c.correction_factor, unit),
          correction_dose_units: c.correction_dose,
          iob_units: c.iob,
          iob_reduction_units: c.iob_reduction,
        })
        .execute();
    }
    if (meal.fat_protein_adjustment) {
      const a = meal.fat_protein_adjustment;
      await trx
        .insertInto("meal_fat_protein_adjustments")
        .values({
          meal_entry_id: meal.id,
          total_fat_g: a.total_fat_g,
          total_protein_g: a.total_protein_g,
          trigger: a.threshold_met as "high_fat" | "fat_and_protein" | "energy_ratio",
          multiplier: a.multiplier,
          adjustment_dose_units: a.adjustment_dose,
        })
        .execute();
    }
    if (meal.trace) {
      await trx
        .insertInto("meal_traces")
        .values({
          meal_entry_id: meal.id,
          model: meal.trace.model,
          duration_ms: Math.round(meal.trace.duration_ms),
          raw_response: meal.trace.raw_response,
          searches: JSON.stringify(meal.trace.searches),
        })
        .execute();
    }
  }

  private async ratioVersion(trx: Executor, meal: MealEntry): Promise<string> {
    const window = meal.meal_window;
    const existing = await trx
      .selectFrom("ratio_versions")
      .select("id")
      .where("window_name", "=", window.name)
      .where("window_start_hour", "=", window.start_hour)
      .where("window_end_hour", "=", window.end_hour)
      .where("carbs_g_per_unit", "=", window.ratio)
      .where("profile_id", "is", null)
      .executeTakeFirst();
    if (existing) return existing.id;
    const id = this.newId();
    await trx
      .insertInto("ratio_versions")
      .values({
        id,
        window_name: window.name,
        window_start_hour: window.start_hour,
        window_end_hour: window.end_hour,
        profile_id: null,
        profile_name: null,
        adjustment_mode: null,
        percent_adjustment: null,
        carbs_g_per_unit: window.ratio,
        first_used_at: meal.timestamp,
      })
      .execute();
    return id;
  }

  private async hydrate(
    db: Executor,
    rows: TimelineRow[],
  ): Promise<TimelineEntry[]> {
    if (rows.length === 0) return [];
    const display = await displayOf(db);
    const idsOf = (kind: TimelineRow["kind"]) =>
      rows.filter((r) => r.kind === kind).map((r) => r.id);

    const built = new Map<string, TimelineEntry>();
    const glucoseIds = idsOf("glucose_reading");
    if (glucoseIds.length > 0) {
      const found = await db
        .selectFrom("glucose_entries")
        .selectAll()
        .where("id", "in", glucoseIds)
        .execute();
      for (const row of found) {
        const entry: GlucoseEntry = {
          id: row.id,
          timestamp: row.occurred_at.toISOString(),
          time_zone: row.occurred_tz,
          type: "glucose_reading",
          value: fromMgDl(row.glucose_mg_dl, display.unit),
          unit: display.unit,
        };
        built.set(row.id, entry);
      }
    }
    const slowIds = idsOf("slow_insulin");
    if (slowIds.length > 0) {
      const found = await db
        .selectFrom("slow_insulin_entries")
        .selectAll()
        .where("id", "in", slowIds)
        .execute();
      for (const row of found) {
        const entry: SlowInsulinEntry = {
          id: row.id,
          timestamp: row.occurred_at.toISOString(),
          time_zone: row.occurred_tz,
          type: "slow_insulin",
          units: row.insulin_units,
          insulin_id: row.insulin as SlowInsulinEntry["insulin_id"],
        };
        built.set(row.id, entry);
      }
    }
    const fastIds = idsOf("fast_insulin");
    if (fastIds.length > 0) {
      const found = await db
        .selectFrom("fast_insulin_entries")
        .selectAll()
        .where("id", "in", fastIds)
        .execute();
      for (const row of found) {
        const entry: FastInsulinEntry = {
          id: row.id,
          timestamp: row.occurred_at.toISOString(),
          time_zone: row.occurred_tz,
          type: "fast_insulin",
          units: row.insulin_units,
          insulin_id: row.insulin as FastInsulinEntry["insulin_id"],
          related_meal_id: row.meal_entry_id,
        };
        built.set(row.id, entry);
      }
    }
    const mealIds = idsOf("meal");
    if (mealIds.length > 0) {
      for (const meal of await this.meals(db, mealIds, display)) {
        built.set(meal.id, meal);
      }
    }

    return rows.map((row) => {
      const entry = built.get(row.id);
      if (!entry) {
        throw new StoredDataError(
          "timeline",
          new Error(`${row.kind} ${row.id} has no row in its table`),
        );
      }
      try {
        return entrySchema.parse(entry);
      } catch (e) {
        throw new StoredDataError(`${row.kind} ${row.id}`, e);
      }
    });
  }

  private async meals(
    db: Executor,
    ids: string[],
    display: Display,
  ): Promise<MealEntry[]> {
    const meals = await db
      .selectFrom("meal_entries")
      .innerJoin("ratio_versions", "ratio_versions.id", "meal_entries.ratio_version_id")
      .select([
        "meal_entries.id",
        "meal_entries.occurred_at",
        "meal_entries.occurred_tz",
        "meal_entries.input_text",
        "meal_entries.input_language",
        "meal_entries.total_carbs_g",
        "meal_entries.carb_dose_units",
        "meal_entries.total_dose_units",
        "ratio_versions.window_name",
        "ratio_versions.window_start_hour",
        "ratio_versions.window_end_hour",
        "ratio_versions.carbs_g_per_unit",
      ])
      .where("meal_entries.id", "in", ids)
      .execute();
    const items = await db
      .selectFrom("meal_items")
      .selectAll()
      .where("meal_entry_id", "in", ids)
      .orderBy("position")
      .execute();
    const corrections = await db
      .selectFrom("meal_corrections")
      .selectAll()
      .where("meal_entry_id", "in", ids)
      .execute();
    const adjustments = await db
      .selectFrom("meal_fat_protein_adjustments")
      .selectAll()
      .where("meal_entry_id", "in", ids)
      .execute();
    const traces = await db
      .selectFrom("meal_traces")
      .selectAll()
      .where("meal_entry_id", "in", ids)
      .execute();

    return meals.map((row) => {
      const correction = corrections.find((c) => c.meal_entry_id === row.id);
      const adjustment = adjustments.find((a) => a.meal_entry_id === row.id);
      const trace = traces.find((t) => t.meal_entry_id === row.id);
      const rawFoodDose = row.total_carbs_g / row.carbs_g_per_unit;
      const meal: MealEntry = {
        id: row.id,
        timestamp: row.occurred_at.toISOString(),
        time_zone: row.occurred_tz,
        type: "meal",
        input_text: row.input_text,
        language: row.input_language,
        meal_window: {
          name: row.window_name,
          start_hour: row.window_start_hour,
          end_hour: row.window_end_hour,
          ratio: row.carbs_g_per_unit,
        },
        items: items
          .filter((i) => i.meal_entry_id === row.id)
          .map((item): CalculatedItem => {
            const source = item.source as FoodSourceId;
            return {
              description: item.description,
              weight_g: item.weight_g,
              net_carbs_per_100g: item.carbs_per_100g,
              net_carbs_g: item.carbs_g,
              fat_per_100g: item.fat_per_100g,
              protein_per_100g: item.protein_per_100g,
              fat_g: item.fat_g,
              protein_g: item.protein_g,
              assumed_cooked: item.assumed_cooked,
              confidence: item.confidence,
              notes: item.notes,
              warning: item.warning,
              data_source: dataSourceOfFoodSource(source),
              estimated: FOOD_SOURCES[source].estimate,
              glycemic_index: item.glycemic_index,
              gi_estimated: item.gi_estimated,
              food_item: item.food_snapshot as FoodItem | null,
            };
          }),
        total_net_carbs_g: row.total_carbs_g,
        recommended_dose: row.carb_dose_units,
        total_dose: row.total_dose_units,
      };
      if (correction) {
        meal.correction = {
          current_blood_sugar: fromMgDl(
            correction.current_glucose_mg_dl,
            display.unit,
          ),
          target_blood_sugar: fromMgDl(
            correction.target_glucose_mg_dl,
            display.unit,
          ),
          correction_factor: fromMgDl(
            correction.glucose_drop_mg_dl_per_unit,
            display.unit,
          ),
          correction_dose: correction.correction_dose_units,
          iob: correction.iob_units,
          iob_reduction: correction.iob_reduction_units,
          total_dose: adjustment
            ? Math.max(
                0,
                roundToIncrement(
                  rawFoodDose + correction.correction_dose_units,
                  display.penIncrement,
                ),
              )
            : row.total_dose_units,
        };
      }
      if (adjustment) {
        meal.fat_protein_adjustment = {
          total_fat_g: adjustment.total_fat_g,
          total_protein_g: adjustment.total_protein_g,
          threshold_met: adjustment.trigger,
          multiplier: adjustment.multiplier,
          adjustment_dose: adjustment.adjustment_dose_units,
          total_dose: row.total_dose_units,
        };
      }
      if (trace) {
        meal.trace = {
          searches: trace.searches as NonNullable<MealEntry["trace"]>["searches"],
          raw_response: trace.raw_response,
          model: trace.model,
          duration_ms: trace.duration_ms,
        };
      }
      return meal;
    });
  }
}

async function displayOf(db: Executor): Promise<Display> {
  const row = await db
    .selectFrom("settings")
    .select(["glucose_unit", "pen_increment_units"])
    .executeTakeFirst();
  return {
    unit: row?.glucose_unit ?? "mg/dL",
    penIncrement: row?.pen_increment_units ?? 0.5,
  };
}

function isUuid(text: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}
