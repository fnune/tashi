import type { FastInsulinEntry, TimelineEntry } from "@tashi/shared";
import { DEFAULT_SETTINGS, type FoodVocabEntry } from "@tashi/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Repositories } from "../repositories.js";
import { seal } from "../secret-box.js";

export interface RepositoryHarness {
  repositories: Repositories;
  dispose(): Promise<void>;
}

function fastInsulin(
  id: string,
  timestamp: string,
  units = 2,
): FastInsulinEntry {
  return {
    id,
    timestamp,
    type: "fast_insulin",
    units,
    insulin_id: "novorapid",
    related_meal_id: null,
  };
}

function vocabEntry(
  description: string,
  fdc_id: number,
  use_count = 1,
): FoodVocabEntry {
  return {
    description,
    fdc_id,
    usda_description: description,
    default_weight_g: 100,
    use_count,
    last_used: "2026-06-13T12:00:00.000Z",
  };
}

export function repositoryContract(
  name: string,
  open: () => Promise<RepositoryHarness>,
): void {
  describe(`${name} repositories`, () => {
    let harness: RepositoryHarness;
    let repositories: Repositories;

    beforeEach(async () => {
      harness = await open();
      repositories = harness.repositories;
    });

    afterEach(async () => {
      await harness.dispose();
    });

    describe("settings", () => {
      it("starts with the defaults", async () => {
        expect(await repositories.settings.get()).toEqual(DEFAULT_SETTINGS);
      });

      it("gives back what was saved", async () => {
        const settings = { ...DEFAULT_SETTINGS, target_blood_sugar: 110 };
        await repositories.settings.save(settings);
        expect(await repositories.settings.get()).toEqual(settings);
      });
    });

    describe("timeline", () => {
      it("starts empty", async () => {
        expect(await repositories.timeline.list()).toEqual([]);
      });

      it("lists newest first whatever the order of insertion", async () => {
        await repositories.timeline.add([
          fastInsulin("old", "2026-06-13T08:00:00.000Z"),
          fastInsulin("new", "2026-06-13T10:00:00.000Z"),
        ]);
        await repositories.timeline.add([
          fastInsulin("mid", "2026-06-13T09:00:00.000Z"),
        ]);
        expect((await repositories.timeline.list()).map((e) => e.id)).toEqual([
          "new",
          "mid",
          "old",
        ]);
      });

      it("finds an entry by id", async () => {
        await repositories.timeline.add([
          fastInsulin("a", "2026-06-13T08:00:00.000Z"),
        ]);
        expect((await repositories.timeline.get("a"))?.id).toBe("a");
        expect(await repositories.timeline.get("missing")).toBeNull();
      });

      it("replaces an entry and reorders it by its new time", async () => {
        await repositories.timeline.add([
          fastInsulin("a", "2026-06-13T08:00:00.000Z"),
          fastInsulin("b", "2026-06-13T09:00:00.000Z"),
        ]);
        const moved: TimelineEntry = fastInsulin(
          "a",
          "2026-06-13T10:00:00.000Z",
          5,
        );
        expect(await repositories.timeline.replace(moved)).toBe(true);
        const listed = await repositories.timeline.list();
        expect(listed.map((e) => e.id)).toEqual(["a", "b"]);
        expect(listed[0]).toMatchObject({ units: 5 });
      });

      it("does not create an entry when replacing an unknown id", async () => {
        expect(
          await repositories.timeline.replace(
            fastInsulin("ghost", "2026-06-13T10:00:00.000Z"),
          ),
        ).toBe(false);
        expect(await repositories.timeline.list()).toEqual([]);
      });

      it("deletes one entry and says whether it existed", async () => {
        await repositories.timeline.add([
          fastInsulin("a", "2026-06-13T08:00:00.000Z"),
          fastInsulin("b", "2026-06-13T09:00:00.000Z"),
        ]);
        expect(await repositories.timeline.delete("a")).toBe(true);
        expect(await repositories.timeline.delete("a")).toBe(false);
        expect((await repositories.timeline.list()).map((e) => e.id)).toEqual([
          "b",
        ]);
      });

      it("clears everything", async () => {
        await repositories.timeline.add([
          fastInsulin("a", "2026-06-13T08:00:00.000Z"),
        ]);
        await repositories.timeline.clear();
        expect(await repositories.timeline.list()).toEqual([]);
      });

      it("keeps every entry when additions overlap", async () => {
        await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            repositories.timeline.add([
              fastInsulin(
                `e${i}`,
                `2026-06-13T10:${String(i).padStart(2, "0")}:00.000Z`,
              ),
            ]),
          ),
        );
        expect(await repositories.timeline.list()).toHaveLength(20);
      });
    });

    describe("vocabulary", () => {
      it("starts empty", async () => {
        expect(await repositories.vocabulary.list()).toEqual([]);
      });

      it("inserts new entries", async () => {
        await repositories.vocabulary.upsert([vocabEntry("Rice", 1)]);
        await repositories.vocabulary.upsert([vocabEntry("Bread", 2)]);
        expect(await repositories.vocabulary.list()).toHaveLength(2);
      });

      it("overwrites the entry with the same description in any case and the same food", async () => {
        await repositories.vocabulary.upsert([vocabEntry("Rice", 1, 1)]);
        await repositories.vocabulary.upsert([vocabEntry("rice", 1, 2)]);
        expect(await repositories.vocabulary.list()).toMatchObject([
          { use_count: 2 },
        ]);
      });

      it("keeps the same description for another food apart", async () => {
        await repositories.vocabulary.upsert([vocabEntry("Rice", 1)]);
        await repositories.vocabulary.upsert([vocabEntry("Rice", 2)]);
        expect(await repositories.vocabulary.list()).toHaveLength(2);
      });
    });

    describe("api key", () => {
      it("starts without a record", async () => {
        expect(await repositories.apiKey.get()).toBeNull();
      });

      it("keeps the latest record until it is deleted", async () => {
        const first = seal("one", "pw");
        const second = seal("two", "pw");
        await repositories.apiKey.save(first);
        await repositories.apiKey.save(second);
        expect(await repositories.apiKey.get()).toEqual(second);
        await repositories.apiKey.delete();
        expect(await repositories.apiKey.get()).toBeNull();
      });

      it("deleting nothing is not an error", async () => {
        await expect(repositories.apiKey.delete()).resolves.toBeUndefined();
      });
    });
  });
}
