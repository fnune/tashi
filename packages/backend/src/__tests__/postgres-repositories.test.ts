import pg from "pg";
import { describe, expect, it } from "vitest";
import { openPostgresRepositories } from "../data/postgres-repositories.js";
import { StoredDataError } from "../data/stored-data-error.js";
import { repositoryContract } from "./repository-contract.js";

const databaseUrl = process.env.TASHI_TEST_DATABASE_URL;

async function sql(statement: string, params: unknown[] = []) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await client.query(statement, params);
  } finally {
    await client.end();
  }
}

async function emptyDatabase() {
  const opened = await openPostgresRepositories(databaseUrl ?? "");
  await sql("TRUNCATE settings, timeline_entries, food_vocabulary, api_key");
  return opened;
}

describe.skipIf(!databaseUrl)("postgres", () => {
  repositoryContract("postgres", async () => {
    const { repositories, close } = await emptyDatabase();
    return { repositories, dispose: close };
  });

  describe("storage", () => {
    it("applies migrations once and keeps the data when opened again", async () => {
      const first = await emptyDatabase();
      await first.repositories.settings.save({
        ...(await first.repositories.settings.get()),
        target_blood_sugar: 95,
      });
      await first.close();

      const second = await openPostgresRepositories(databaseUrl ?? "");
      expect(
        (await second.repositories.settings.get()).target_blood_sugar,
      ).toBe(95);
      await second.close();
      const applied = await sql(
        "SELECT name FROM kysely_migration ORDER BY name",
      );
      expect(applied.rows).toEqual([{ name: "0001-initial" }]);
    });

    it("names the table and entry when a stored row is not in the expected shape", async () => {
      const { repositories, close } = await emptyDatabase();
      await sql(
        "INSERT INTO timeline_entries (id, type, occurred_at, units, insulin_id) VALUES ('bad', 'fast_insulin', now(), 3, 'not-an-insulin')",
      );
      await expect(repositories.timeline.list()).rejects.toThrow(
        StoredDataError,
      );
      await expect(repositories.timeline.list()).rejects.toThrow(
        /timeline_entries bad/,
      );
      await close();
    });

    it("refuses a fast insulin row without units", async () => {
      const { close } = await emptyDatabase();
      await expect(
        sql(
          "INSERT INTO timeline_entries (id, type, occurred_at, insulin_id) VALUES ('x', 'fast_insulin', now(), 'novorapid')",
        ),
      ).rejects.toThrow();
      await close();
    });

    it("keeps a meal's detail intact", async () => {
      const { repositories, close } = await emptyDatabase();
      const meal = {
        id: "m1",
        timestamp: "2026-06-13T12:00:00.000Z",
        type: "meal" as const,
        input_text: "rice",
        language: "en" as const,
        meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
        items: [],
        total_net_carbs_g: 30,
        recommended_dose: 3,
      };
      await repositories.timeline.add([meal]);
      expect(await repositories.timeline.get("m1")).toEqual(meal);
      await close();
    });
  });
});
