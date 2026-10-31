import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../data/database.js";
import type { WriteBatch } from "../data/write-batch.js";

interface OpenedBatch {
  db: Kysely<Database>;
  batch: WriteBatch;
  dispose(): Promise<void>;
}

const BREAKFAST = "00000000-0000-4000-8000-000000000001";
const LUNCH = "00000000-0000-4000-8000-000000000002";

export function writeBatchContract(
  name: string,
  open: () => Promise<OpenedBatch>,
) {
  describe(`${name} write batch`, () => {
    let opened: OpenedBatch;
    beforeEach(async () => {
      opened = await open();
    });
    afterEach(async () => {
      await opened.dispose();
    });

    const window = (id: string, position: number, name: string) =>
      opened.db.insertInto("meal_windows").values({
        id,
        position,
        name,
        start_hour: 6,
        end_hour: 11,
        carbs_g_per_unit: 10,
      });

    const ratios = () =>
      opened.db
        .selectFrom("meal_windows")
        .select(["name", "carbs_g_per_unit"])
        .orderBy("position")
        .execute();

    it("runs the writes in the order given", async () => {
      await opened.batch.write([
        window(BREAKFAST, 0, "Breakfast"),
        opened.db
          .updateTable("meal_windows")
          .set({ carbs_g_per_unit: 12 })
          .where("id", "=", BREAKFAST),
      ]);
      expect(await ratios()).toEqual([
        { name: "Breakfast", carbs_g_per_unit: 12 },
      ]);
    });

    it("applies none of the writes when one fails", async () => {
      await expect(
        opened.batch.write([
          window(BREAKFAST, 0, "Breakfast"),
          window(LUNCH, 1, "Lunch"),
          window(BREAKFAST, 2, "Dinner"),
        ]),
      ).rejects.toThrow();
      expect(await ratios()).toEqual([]);
    });

    it("counts the rows each write changed", async () => {
      const results = await opened.batch.write([
        window(BREAKFAST, 0, "Breakfast"),
        window(LUNCH, 1, "Lunch"),
        opened.db
          .updateTable("meal_windows")
          .set({ carbs_g_per_unit: 8 })
          .where("name", "=", "Supper"),
        opened.db.deleteFrom("meal_windows"),
      ]);
      expect(results.map((result) => result.affectedRows)).toEqual([
        1, 1, 0, 2,
      ]);
    });
  });
}
