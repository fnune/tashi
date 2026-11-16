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
import {
  foodItemSchema,
  parseTraceSchema,
  storedTimelineSchema,
} from "../../domain/schemas.js";
import type { Db, Executor } from "../database.js";
import { StoredDataError } from "../stored-data-error.js";
import type { WriteBatch, WriteQuery } from "../write-batch.js";
import { flagOf, inStatements, instantOf } from "./columns.js";
import { fromMgDl, toMgDl } from "./glucose-units.js";

const entrySchema = storedTimelineSchema.element;

interface TimelineRow {
  id: string;
  kind: TimelineEntry["type"];
  occurred_at: string;
  occurred_tz: string;
}

interface Display {
  unit: GlucoseUnit;
  penIncrement: 0.5 | 1;
}

export class SqliteTimelineRepository implements TimelineRepository {
  constructor(
    private db: Db,
    private batch: WriteBatch,
    private newId: IdGenerator,
    private catalogRelease: string,
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
          ? sql`(occurred_at, id) < (${before.occurredAt}, ${before.id})`
          : sql`TRUE`
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
          ? { occurredAt: last.occurred_at, id: last.id }
          : null,
    };
  }

  async since(instant: Date): Promise<TimelineEntry[]> {
    const result = await sql<TimelineRow>`
      SELECT id, kind, occurred_at, occurred_tz FROM timeline
      WHERE occurred_at >= ${instantOf(instant)}
      ORDER BY occurred_at DESC, id DESC`.execute(this.db);
    return this.hydrate(this.db, result.rows);
  }

  async get(id: string): Promise<TimelineEntry | null> {
    if (!isUuid(id)) return null;
    const result = await sql<TimelineRow>`
      SELECT id, kind, occurred_at, occurred_tz FROM timeline WHERE id = ${id}`.execute(
      this.db,
    );
    const [entry] = await this.hydrate(this.db, result.rows);
    return entry ?? null;
  }

  async add(entries: TimelineEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const display = await displayOf(this.db);
    const ratioVersions = new Map<string, string>();
    const mealsFirst = [
      ...entries.filter((entry) => entry.type === "meal"),
      ...entries.filter((entry) => entry.type !== "meal"),
    ];
    const writes: WriteQuery[] = mealsFirst.some((e) => e.type === "meal")
      ? [
          this.db
            .insertInto("catalog_releases")
            .values({ label: this.catalogRelease })
            .onConflict((oc) => oc.doNothing()),
        ]
      : [];
    for (const entry of mealsFirst) {
      writes.push(...(await this.insert(entry, display, ratioVersions)));
    }
    await this.batch.write(writes);
  }

  async replace(entry: TimelineEntry): Promise<boolean> {
    if (!isUuid(entry.id)) return false;
    const moment = {
      occurred_at: instantOf(entry.timestamp),
      occurred_tz: entry.time_zone,
    };
    switch (entry.type) {
      case "glucose_reading": {
        return this.updated(
          this.db
            .updateTable("glucose_entries")
            .set({
              ...moment,
              glucose_mg_dl: toMgDl(entry.value, entry.unit),
            })
            .where("id", "=", entry.id),
        );
      }
      case "slow_insulin": {
        return this.updated(
          this.db
            .updateTable("slow_insulin_entries")
            .set({
              ...moment,
              insulin: entry.insulin_id,
              insulin_units: entry.units,
            })
            .where("id", "=", entry.id),
        );
      }
      case "fast_insulin": {
        return this.updated(
          this.db
            .updateTable("fast_insulin_entries")
            .set({
              ...moment,
              insulin: entry.insulin_id,
              insulin_units: entry.units,
              meal_entry_id: entry.related_meal_id,
            })
            .where("id", "=", entry.id),
        );
      }
      case "meal": {
        return this.updated(
          this.db
            .updateTable("meal_entries")
            .set(moment)
            .where("id", "=", entry.id),
        );
      }
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const results = await this.batch.write(
      (
        [
          "glucose_entries",
          "slow_insulin_entries",
          "fast_insulin_entries",
          "meal_entries",
        ] as const
      ).map((table) => this.db.deleteFrom(table).where("id", "=", id)),
    );
    return results.some((result) => result.affectedRows > 0);
  }

  async clear(): Promise<void> {
    await this.batch.write([
      this.db.deleteFrom("glucose_entries"),
      this.db.deleteFrom("slow_insulin_entries"),
      this.db.deleteFrom("fast_insulin_entries"),
      this.db.deleteFrom("meal_entries"),
    ]);
  }

  private async updated(query: WriteQuery): Promise<boolean> {
    const [result] = await this.batch.write([query]);
    return (result?.affectedRows ?? 0) > 0;
  }

  private async insert(
    entry: TimelineEntry,
    display: Display,
    ratioVersions: Map<string, string>,
  ): Promise<WriteQuery[]> {
    const moment = {
      id: entry.id,
      occurred_at: instantOf(entry.timestamp),
      occurred_tz: entry.time_zone,
    };
    switch (entry.type) {
      case "glucose_reading":
        return [
          this.db.insertInto("glucose_entries").values({
            ...moment,
            glucose_mg_dl: toMgDl(entry.value, entry.unit),
          }),
        ];
      case "slow_insulin":
        return [
          this.db.insertInto("slow_insulin_entries").values({
            ...moment,
            insulin: entry.insulin_id,
            action: "basal",
            insulin_units: entry.units,
          }),
        ];
      case "fast_insulin":
        return [
          this.db.insertInto("fast_insulin_entries").values({
            ...moment,
            insulin: entry.insulin_id,
            action: "bolus",
            insulin_units: entry.units,
            meal_entry_id: entry.related_meal_id,
          }),
        ];
      case "meal":
        return this.insertMeal(entry, display, ratioVersions);
    }
  }

  private async insertMeal(
    meal: MealEntry,
    display: Display,
    ratioVersions: Map<string, string>,
  ): Promise<WriteQuery[]> {
    const writes: WriteQuery[] = [];
    const ratioVersionId = await this.ratioVersion(meal, ratioVersions, writes);
    writes.push(
      this.db.insertInto("meal_entries").values({
        id: meal.id,
        occurred_at: instantOf(meal.timestamp),
        occurred_tz: meal.time_zone,
        input_text: meal.input_text,
        input_language: meal.language,
        ratio_version_id: ratioVersionId,
        total_carbs_g: meal.total_net_carbs_g,
        carb_dose_units: meal.carb_units,
        total_dose_units: meal.total_units,
        catalog_release: this.catalogRelease,
      }),
    );

    const itemRows = meal.items.map((item, position) => {
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
        assumed_cooked: flagOf(item.assumed_cooked),
        confidence: item.confidence,
        source,
        carbs_per_100g: item.net_carbs_per_100g,
        carbs_g: item.net_carbs_g,
        fat_per_100g: item.fat_per_100g,
        fat_g: item.fat_g,
        protein_per_100g: item.protein_per_100g,
        protein_g: item.protein_g,
        glycemic_index: item.glycemic_index,
        gi_estimated: flagOf(item.gi_estimated),
        notes: item.notes,
        warning: item.warning,
        external_id: item.food_item ? String(item.food_item.fdc_id) : null,
        food_snapshot: item.food_item ? JSON.stringify(item.food_item) : null,
      };
    });
    for (const rows of inStatements(itemRows)) {
      writes.push(this.db.insertInto("meal_items").values(rows));
    }

    const unit = display.unit;
    if (meal.correction) {
      const c = meal.correction;
      writes.push(
        this.db.insertInto("meal_corrections").values({
          meal_entry_id: meal.id,
          current_glucose_mg_dl: toMgDl(c.current_blood_sugar, unit),
          target_glucose_mg_dl: toMgDl(c.target_blood_sugar, unit),
          glucose_drop_mg_dl_per_unit: toMgDl(c.correction_factor, unit),
          correction_dose_units: c.correction_units,
          iob_units: c.iob,
          iob_reduction_units: c.iob_reduction,
        }),
      );
    }
    if (meal.fat_protein_adjustment) {
      const a = meal.fat_protein_adjustment;
      writes.push(
        this.db.insertInto("meal_fat_protein_adjustments").values({
          meal_entry_id: meal.id,
          total_fat_g: a.total_fat_g,
          total_protein_g: a.total_protein_g,
          trigger: a.threshold_met as
            | "high_fat"
            | "fat_and_protein"
            | "energy_ratio",
          multiplier: a.multiplier,
          adjustment_dose_units: a.adjustment_units,
        }),
      );
    }
    if (meal.trace) {
      writes.push(
        this.db.insertInto("meal_traces").values({
          meal_entry_id: meal.id,
          model: meal.trace.model,
          duration_ms: Math.round(meal.trace.duration_ms),
          raw_response: meal.trace.raw_response,
          searches: JSON.stringify(meal.trace.searches),
        }),
      );
    }
    return writes;
  }

  private async ratioVersion(
    meal: MealEntry,
    known: Map<string, string>,
    writes: WriteQuery[],
  ): Promise<string> {
    const window = meal.meal_window;
    const key = JSON.stringify([
      window.name,
      window.start_hour,
      window.end_hour,
      window.ratio,
    ]);
    const knownId = known.get(key);
    if (knownId) return knownId;
    const existing = await this.db
      .selectFrom("ratio_versions")
      .select("id")
      .where("window_name", "=", window.name)
      .where("window_start_hour", "=", window.start_hour)
      .where("window_end_hour", "=", window.end_hour)
      .where("carbs_g_per_unit", "=", window.ratio)
      .where("profile_id", "is", null)
      .executeTakeFirst();
    if (existing) {
      known.set(key, existing.id);
      return existing.id;
    }
    const id = this.newId();
    known.set(key, id);
    writes.push(
      this.db.insertInto("ratio_versions").values({
        id,
        window_name: window.name,
        window_start_hour: window.start_hour,
        window_end_hour: window.end_hour,
        profile_id: null,
        profile_name: null,
        adjustment_mode: null,
        percent_adjustment: null,
        carbs_g_per_unit: window.ratio,
        first_used_at: instantOf(meal.timestamp),
      }),
    );
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
          timestamp: row.occurred_at,
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
          timestamp: row.occurred_at,
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
          timestamp: row.occurred_at,
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
      .innerJoin(
        "ratio_versions",
        "ratio_versions.id",
        "meal_entries.ratio_version_id",
      )
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
        timestamp: row.occurred_at,
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
              assumed_cooked: item.assumed_cooked === 1,
              confidence: item.confidence,
              notes: item.notes,
              warning: item.warning,
              data_source: dataSourceOfFoodSource(source),
              estimated: FOOD_SOURCES[source].estimate,
              glycemic_index: item.glycemic_index,
              gi_estimated: item.gi_estimated === 1,
              food_item: snapshotOf(row.id, item.food_snapshot),
            };
          }),
        total_net_carbs_g: row.total_carbs_g,
        carb_units: row.carb_dose_units,
        total_units: row.total_dose_units,
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
          correction_units: correction.correction_dose_units,
          iob: correction.iob_units,
          iob_reduction: correction.iob_reduction_units,
          total_units: adjustment
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
          adjustment_units: adjustment.adjustment_dose_units,
          total_units: row.total_dose_units,
        };
      }
      if (trace) {
        meal.trace = {
          searches: searchesOf(row.id, trace.searches),
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    text,
  );
}

function snapshotOf(mealId: string, snapshot: string | null): FoodItem | null {
  if (snapshot === null) return null;
  try {
    return foodItemSchema.parse(JSON.parse(snapshot));
  } catch (e) {
    throw new StoredDataError(`meal ${mealId} food snapshot`, e);
  }
}

function searchesOf(mealId: string, searches: string): MealTrace["searches"] {
  try {
    return parseTraceSchema.shape.searches.parse(JSON.parse(searches));
  } catch (e) {
    throw new StoredDataError(`meal ${mealId} trace`, e);
  }
}

type MealTrace = NonNullable<MealEntry["trace"]>;
