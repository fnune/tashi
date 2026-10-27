import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import { Kysely, PostgresDialect, type Selectable } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import {
  parseStoredSettings,
  sealedSecretSchema,
  storedTimelineSchema,
} from "../domain/schemas.js";
import type {
  ApiKeyRepository,
  Repositories,
  SettingsRepository,
  TimelineRepository,
  VocabularyRepository,
} from "../domain/repositories.js";
import type { SealedSecret } from "../domain/secret-box.js";
import type { Database, TimelineEntriesTable } from "./database.js";
import { migrations } from "./migrations/index.js";
import { StoredDataError } from "./stored-data-error.js";

type Db = Kysely<Database>;
type TimelineRow = Selectable<TimelineEntriesTable>;

const entrySchema = storedTimelineSchema.element;

function parseStored<T>(source: string, parse: () => T): T {
  try {
    return parse();
  } catch (e) {
    throw new StoredDataError(source, e);
  }
}

function toRow(entry: TimelineEntry) {
  const empty = {
    units: null,
    insulin_id: null,
    related_meal_id: null,
    glucose_value: null,
    glucose_unit: null,
    meal: null,
  };
  const base = { id: entry.id, occurred_at: entry.timestamp };
  switch (entry.type) {
    case "meal": {
      const { id: _id, timestamp: _timestamp, type: _type, ...meal } = entry;
      return { ...base, ...empty, type: entry.type, meal: JSON.stringify(meal) };
    }
    case "fast_insulin":
      return {
        ...base,
        ...empty,
        type: entry.type,
        units: entry.units,
        insulin_id: entry.insulin_id,
        related_meal_id: entry.related_meal_id,
      };
    case "slow_insulin":
      return {
        ...base,
        ...empty,
        type: entry.type,
        units: entry.units,
        insulin_id: entry.insulin_id,
      };
    case "glucose_reading":
      return {
        ...base,
        ...empty,
        type: entry.type,
        glucose_value: entry.value,
        glucose_unit: entry.unit,
      };
  }
}

function fromRow(row: TimelineRow): TimelineEntry {
  const common = { id: row.id, timestamp: row.occurred_at.toISOString() };
  const candidate = (() => {
    switch (row.type) {
      case "meal":
        return { ...common, type: row.type, ...row.meal };
      case "fast_insulin":
        return {
          ...common,
          type: row.type,
          units: row.units,
          insulin_id: row.insulin_id,
          related_meal_id: row.related_meal_id,
        };
      case "slow_insulin":
        return {
          ...common,
          type: row.type,
          units: row.units,
          insulin_id: row.insulin_id,
        };
      case "glucose_reading":
        return {
          ...common,
          type: row.type,
          value: row.glucose_value,
          unit: row.glucose_unit,
        };
    }
  })();
  return parseStored(`timeline_entries ${row.id}`, () =>
    entrySchema.parse(candidate),
  );
}

class PostgresSettingsRepository implements SettingsRepository {
  constructor(private db: Db) {}

  async get(): Promise<Settings> {
    const row = await this.db
      .selectFrom("settings")
      .select("data")
      .executeTakeFirst();
    return parseStored("settings", () => parseStoredSettings(row?.data ?? {}));
  }

  async save(settings: Settings): Promise<void> {
    const data = JSON.stringify(settings);
    await this.db
      .insertInto("settings")
      .values({ data })
      .onConflict((oc) => oc.column("id").doUpdateSet({ data }))
      .execute();
  }
}

class PostgresTimelineRepository implements TimelineRepository {
  constructor(private db: Db) {}

  async list(): Promise<TimelineEntry[]> {
    const rows = await this.db
      .selectFrom("timeline_entries")
      .selectAll()
      .orderBy("occurred_at", "desc")
      .orderBy("id", "desc")
      .execute();
    return rows.map(fromRow);
  }

  async get(id: string): Promise<TimelineEntry | null> {
    const row = await this.db
      .selectFrom("timeline_entries")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? fromRow(row) : null;
  }

  async add(entries: TimelineEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db.insertInto("timeline_entries").values(entries.map(toRow)).execute();
  }

  async replace(entry: TimelineEntry): Promise<boolean> {
    const { id: _id, ...columns } = toRow(entry);
    const result = await this.db
      .updateTable("timeline_entries")
      .set(columns)
      .where("id", "=", entry.id)
      .executeTakeFirst();
    return result.numUpdatedRows > 0n;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("timeline_entries")
      .where("id", "=", id)
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }

  async clear(): Promise<void> {
    await this.db.deleteFrom("timeline_entries").execute();
  }
}

class PostgresVocabularyRepository implements VocabularyRepository {
  constructor(private db: Db) {}

  async list(): Promise<FoodVocabEntry[]> {
    const rows = await this.db
      .selectFrom("food_vocabulary")
      .selectAll()
      .orderBy("last_used", "desc")
      .orderBy("description_key")
      .orderBy("fdc_id")
      .execute();
    return rows.map((row) => ({
      description: row.description,
      fdc_id: row.fdc_id,
      usda_description: row.usda_description,
      default_weight_g: row.default_weight_g,
      use_count: row.use_count,
      last_used: row.last_used.toISOString(),
    }));
  }

  async upsert(entries: FoodVocabEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await this.db
      .insertInto("food_vocabulary")
      .values(
        entries.map((entry) => ({
          description_key: entry.description.toLowerCase(),
          fdc_id: entry.fdc_id,
          description: entry.description,
          usda_description: entry.usda_description,
          default_weight_g: entry.default_weight_g,
          use_count: entry.use_count,
          last_used: entry.last_used,
        })),
      )
      .onConflict((oc) =>
        oc.columns(["description_key", "fdc_id"]).doUpdateSet((eb) => ({
          description: eb.ref("excluded.description"),
          usda_description: eb.ref("excluded.usda_description"),
          default_weight_g: eb.ref("excluded.default_weight_g"),
          use_count: eb.ref("excluded.use_count"),
          last_used: eb.ref("excluded.last_used"),
        })),
      )
      .execute();
  }
}

class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private db: Db) {}

  async get(): Promise<SealedSecret | null> {
    const row = await this.db
      .selectFrom("api_key")
      .select(["salt", "iv", "tag", "data"])
      .executeTakeFirst();
    return row ? parseStored("api_key", () => sealedSecretSchema.parse(row)) : null;
  }

  async save(record: SealedSecret): Promise<void> {
    await this.db
      .insertInto("api_key")
      .values(record)
      .onConflict((oc) => oc.column("id").doUpdateSet(record))
      .execute();
  }

  async delete(): Promise<void> {
    await this.db.deleteFrom("api_key").execute();
  }
}

export interface PostgresRepositories {
  repositories: Repositories;
  close(): Promise<void>;
}

export async function openPostgresRepositories(
  databaseUrl: string,
): Promise<PostgresRepositories> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  pool.on("error", (error) => {
    console.error("Idle database connection failed:", error.message);
  });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) {
    await db.destroy();
    throw error;
  }

  return {
    repositories: {
      settings: new PostgresSettingsRepository(db),
      timeline: new PostgresTimelineRepository(db),
      vocabulary: new PostgresVocabularyRepository(db),
      apiKey: new PostgresApiKeyRepository(db),
    },
    close: () => db.destroy(),
  };
}
