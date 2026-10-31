import type { SelectQueryBuilder } from "kysely";
import { describe, expectTypeOf, it } from "vitest";
import type { Database } from "../data/database.js";
import type { WriteQuery } from "../data/write-batch.js";

describe("write batch", () => {
  it("accepts no reads, so a batch never depends on what it has written", () => {
    expectTypeOf<
      SelectQueryBuilder<Database, "settings", object>
    >().not.toExtend<WriteQuery>();
  });
});
