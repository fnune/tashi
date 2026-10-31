import {
  DEFAULT_SETTINGS,
  type FoodVocabEntry,
  type Settings,
} from "@tashi/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nameKeyOf } from "../domain/auth/authentication.js";
import type { Repositories, TimelineCursor } from "../domain/repositories.js";
import { seal } from "../domain/secret-box.js";
import {
  at,
  fastInsulin,
  fullMeal,
  glucose,
  simpleMeal,
  slowInsulin,
} from "./entries.js";
import { uuidNumber } from "./sequential-ids.js";

export interface RepositoryHarness {
  repositories: Repositories;
  dispose(): Promise<void>;
}

function vocabEntry(
  description: string,
  fdc_id: number,
  use_count = 1,
): FoodVocabEntry {
  return {
    description,
    source: "usda_sr_legacy",
    fdc_id,
    catalog_name: `Catalog ${fdc_id}`,
    default_weight_g: 100,
    use_count,
    last_used: "2026-06-13T12:00:00.000Z",
  };
}

const CUSTOM_PROFILE_ID = "0d2c1b0a-1111-4222-8333-444455556666";

function customSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    meal_windows: [
      { name: "morning", start_hour: 6, end_hour: 12, ratio: 8 },
      { name: "day", start_hour: 12, end_hour: 22, ratio: 11.5 },
      { name: "night", start_hour: 22, end_hour: 6, ratio: 15 },
    ],
    correction_factor: 45,
    target_blood_sugar: 110,
    ratio_format: "units_per_10g",
    pen_increment: 1,
    fat_protein_multiplier: 0.3,
    bolus_insulin_id: "novorapid",
    basal_insulin_id: "lantus",
    insulin_action_minutes: 240,
    language: "es",
    profiles: [
      ...DEFAULT_SETTINGS.profiles,
      {
        id: CUSTOM_PROFILE_ID,
        name: "Weekend",
        emoji: "🏖",
        adjustment: {
          mode: "per_window",
          ratios: { morning: 7, day: 10, night: 14 },
        },
      },
    ],
    active_profile_id: CUSTOM_PROFILE_ID,
    cycle: { enabled: true, last_period_start: "2026-06-01", length_days: 30 },
  };
}

async function collectPages(
  repositories: Repositories,
  limit: number,
): Promise<string[]> {
  const ids: string[] = [];
  let before: TimelineCursor | undefined;
  for (let guard = 0; guard < 50; guard++) {
    const page = await repositories.timeline.page({ before, limit });
    ids.push(...page.entries.map((entry) => entry.id));
    if (!page.next) return ids;
    before = page.next;
  }
  throw new Error("pagination never ended");
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

      it("gives back what was saved, windows and profiles in order", async () => {
        await repositories.settings.save(customSettings());
        expect(await repositories.settings.get()).toEqual(customSettings());
      });

      it("drops windows and profiles that are no longer there", async () => {
        await repositories.settings.save(customSettings());
        const smaller: Settings = {
          ...customSettings(),
          meal_windows: [
            { name: "all day", start_hour: 0, end_hour: 24, ratio: 9 },
          ],
          profiles: DEFAULT_SETTINGS.profiles,
          active_profile_id: "normal",
        };
        await repositories.settings.save(smaller);
        expect(await repositories.settings.get()).toEqual(smaller);
      });

      it("can reorder windows and keep a renamed one apart from the old", async () => {
        await repositories.settings.save(customSettings());
        const reordered: Settings = {
          ...customSettings(),
          meal_windows: [
            { name: "night", start_hour: 22, end_hour: 6, ratio: 15 },
            { name: "afternoon", start_hour: 12, end_hour: 22, ratio: 11.5 },
            { name: "morning", start_hour: 6, end_hour: 12, ratio: 8 },
          ],
          profiles: DEFAULT_SETTINGS.profiles,
          active_profile_id: "normal",
        };
        await repositories.settings.save(reordered);
        expect((await repositories.settings.get()).meal_windows).toEqual(
          reordered.meal_windows,
        );
      });
    });

    describe("timeline", () => {
      it("starts empty", async () => {
        expect(await repositories.timeline.page({ limit: 10 })).toEqual({
          entries: [],
          next: null,
        });
      });

      it("pages newest first across every kind, whatever the order of insertion", async () => {
        await repositories.timeline.add([
          glucose(1, 10),
          fullMeal(2, 40),
          slowInsulin(3, 20),
        ]);
        await repositories.timeline.add([fastInsulin(4, 30, 2)]);
        const page = await repositories.timeline.page({ limit: 10 });
        expect(page.entries.map((e) => e.type)).toEqual([
          "meal",
          "fast_insulin",
          "slow_insulin",
          "glucose_reading",
        ]);
        expect(page.next).toBeNull();
      });

      it("walks the whole timeline page by page without repeats or gaps", async () => {
        const entries = Array.from({ length: 11 }, (_, i) =>
          glucose(i + 1, i * 5),
        );
        await repositories.timeline.add(entries);
        const seen = await collectPages(repositories, 4);
        expect(seen).toHaveLength(11);
        expect(new Set(seen).size).toBe(11);
        expect(seen[0]).toBe(uuidNumber(11));
        expect(seen.at(-1)).toBe(uuidNumber(1));
      });

      it("keeps entries with the same time in a steady order", async () => {
        await repositories.timeline.add([
          glucose(1, 10),
          glucose(2, 10),
          glucose(3, 10),
        ]);
        const seen = await collectPages(repositories, 2);
        expect(seen).toEqual([uuidNumber(3), uuidNumber(2), uuidNumber(1)]);
      });

      it("lists the entries since a moment, newest first", async () => {
        await repositories.timeline.add([
          glucose(1, 0),
          glucose(2, 30),
          glucose(3, 60),
        ]);
        const recent = await repositories.timeline.since(new Date(at(30)));
        expect(recent.map((e) => e.id)).toEqual([uuidNumber(3), uuidNumber(2)]);
      });

      it("finds an entry by id", async () => {
        await repositories.timeline.add([glucose(1, 10)]);
        expect((await repositories.timeline.get(uuidNumber(1)))?.id).toBe(
          uuidNumber(1),
        );
        expect(await repositories.timeline.get(uuidNumber(99))).toBeNull();
        expect(await repositories.timeline.get("not-an-id")).toBeNull();
      });

      it("gives back each kind of entry as it was added", async () => {
        const entries = [
          glucose(1, 10, 143),
          slowInsulin(2, 20),
          fullMeal(3, 30),
          fastInsulin(4, 31, 3),
          simpleMeal(5, 40),
        ];
        await repositories.timeline.add(entries);
        for (const entry of entries) {
          expect(await repositories.timeline.get(entry.id)).toEqual(entry);
        }
      });

      it("keeps a meal of many items, each in its place", async () => {
        const meal = fullMeal(1, 10);
        const [item] = meal.items;
        if (!item) throw new Error("fullMeal has items");
        const many = {
          ...meal,
          items: Array.from({ length: 15 }, (_, i) => ({
            ...item,
            description: `Item ${i}`,
          })),
        };
        await repositories.timeline.add([many]);
        expect(await repositories.timeline.get(meal.id)).toEqual(many);
      });

      it("takes an insulin entry together with its meal, whichever is listed first", async () => {
        await repositories.timeline.add([
          fastInsulin(2, 11, 1),
          fullMeal(1, 10),
        ]);
        expect(await repositories.timeline.get(uuidNumber(2))).toMatchObject({
          related_meal_id: uuidNumber(1),
        });
      });

      it("replaces an entry and reorders it by its new time", async () => {
        await repositories.timeline.add([glucose(1, 10), glucose(2, 20)]);
        const moved = { ...glucose(1, 30, 99) };
        expect(await repositories.timeline.replace(moved)).toBe(true);
        const page = await repositories.timeline.page({ limit: 10 });
        expect(page.entries.map((e) => e.id)).toEqual([
          uuidNumber(1),
          uuidNumber(2),
        ]);
        expect(page.entries[0]).toMatchObject({ value: 99 });
      });

      it("moves a meal in time and changes nothing else about it", async () => {
        const meal = fullMeal(1, 10);
        await repositories.timeline.add([meal]);
        const moved = { ...meal, timestamp: at(50) };
        expect(await repositories.timeline.replace(moved)).toBe(true);
        expect(await repositories.timeline.get(meal.id)).toEqual(moved);
      });

      it("does not create an entry when replacing an unknown id", async () => {
        expect(await repositories.timeline.replace(glucose(9, 10))).toBe(false);
        expect(
          (await repositories.timeline.page({ limit: 10 })).entries,
        ).toEqual([]);
      });

      it("deletes one entry and says whether it existed", async () => {
        await repositories.timeline.add([glucose(1, 10), slowInsulin(2, 20)]);
        expect(await repositories.timeline.delete(uuidNumber(1))).toBe(true);
        expect(await repositories.timeline.delete(uuidNumber(1))).toBe(false);
        expect(await repositories.timeline.delete("not-an-id")).toBe(false);
        expect(await collectPages(repositories, 10)).toEqual([uuidNumber(2)]);
      });

      it("keeps the insulin of a deleted meal, unlinked", async () => {
        await repositories.timeline.add([
          fullMeal(1, 10),
          fastInsulin(2, 11, 1),
        ]);
        await repositories.timeline.delete(uuidNumber(1));
        expect(await repositories.timeline.get(uuidNumber(2))).toMatchObject({
          related_meal_id: null,
        });
      });

      it("clears everything", async () => {
        await repositories.timeline.add([glucose(1, 10), fullMeal(2, 20)]);
        await repositories.timeline.clear();
        expect(await collectPages(repositories, 10)).toEqual([]);
      });

      it("keeps every entry when additions overlap", async () => {
        await Promise.all(
          Array.from({ length: 20 }, (_, i) =>
            repositories.timeline.add([glucose(i + 1, i)]),
          ),
        );
        expect(await collectPages(repositories, 100)).toHaveLength(20);
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

      it("keeps many entries saved at once", async () => {
        await repositories.vocabulary.upsert(
          Array.from({ length: 40 }, (_, i) => vocabEntry(`Food ${i}`, i + 1)),
        );
        expect(await repositories.vocabulary.list()).toHaveLength(40);
      });

      it("clears every entry", async () => {
        await repositories.vocabulary.upsert([
          vocabEntry("Rice", 1),
          vocabEntry("Bread", 2),
        ]);
        await repositories.vocabulary.clear();
        expect(await repositories.vocabulary.list()).toEqual([]);
      });

      it("keeps the same food from another source apart", async () => {
        await repositories.vocabulary.upsert([vocabEntry("Rice", 1)]);
        await repositories.vocabulary.upsert([
          { ...vocabEntry("Rice", 1), source: "usda_survey" },
        ]);
        expect(await repositories.vocabulary.list()).toHaveLength(2);
      });
    });

    describe("accounts", () => {
      const ana = { id: uuidNumber(901), name: "Ana", role: "admin" as const };
      const password = {
        id: uuidNumber(902),
        salt: new Uint8Array(16).fill(1),
        iterations: 1000,
        verifier: new Uint8Array(32).fill(2),
        wrappedDataKey: new Uint8Array(60).fill(3),
      };
      const at = new Date("2026-06-13T12:00:00.000Z");

      it("starts without an account", async () => {
        expect(await repositories.accounts.any()).toBe(false);
        expect(await repositories.accounts.withPassword("ana")).toBeNull();
      });

      it("keeps the first account with its password, found by name in any case", async () => {
        expect(await repositories.accounts.createFirst(ana, password, at)).toBe(
          true,
        );
        expect(await repositories.accounts.any()).toBe(true);
        expect(
          await repositories.accounts.withPassword(nameKeyOf(" ANA ")),
        ).toEqual({ account: ana, password });
        expect(await repositories.accounts.get(ana.id)).toEqual(ana);
      });

      it("refuses a second first account", async () => {
        await repositories.accounts.createFirst(ana, password, at);
        const other = { ...ana, id: uuidNumber(903), name: "Eve" };
        const otherPassword = { ...password, id: uuidNumber(904) };
        expect(
          await repositories.accounts.createFirst(other, otherPassword, at),
        ).toBe(false);
        expect(await repositories.accounts.withPassword("eve")).toBeNull();
        expect(await repositories.accounts.get(other.id)).toBeNull();
      });
    });

    describe("sessions", () => {
      const tokenHash = new Uint8Array(32).fill(7);
      const at = new Date("2026-06-13T12:00:00.000Z");

      async function withAccount() {
        await repositories.accounts.createFirst(
          { id: uuidNumber(911), name: "Ana", role: "admin" },
          {
            id: uuidNumber(912),
            salt: new Uint8Array(16),
            iterations: 1000,
            verifier: new Uint8Array(32),
            wrappedDataKey: new Uint8Array(60),
          },
          at,
        );
        return {
          accountId: uuidNumber(911),
          stage: "signed_in" as const,
          expiresAt: new Date("2026-07-13T12:00:00.000Z"),
          wrappedDataKey: new Uint8Array(60).fill(9),
        };
      }

      it("finds a session by its token hash until it is deleted", async () => {
        const session = await withAccount();
        await repositories.sessions.create(tokenHash, session, at);
        expect(await repositories.sessions.get(tokenHash)).toEqual(session);
        expect(
          await repositories.sessions.get(new Uint8Array(32).fill(8)),
        ).toBeNull();
        await repositories.sessions.delete(tokenHash);
        expect(await repositories.sessions.get(tokenHash)).toBeNull();
      });

      it("deletes an account's expired sessions and keeps the rest", async () => {
        const session = await withAccount();
        const expired = new Uint8Array(32).fill(5);
        await repositories.sessions.create(
          expired,
          { ...session, expiresAt: new Date("2026-06-01T00:00:00.000Z") },
          at,
        );
        await repositories.sessions.create(tokenHash, session, at);
        await repositories.sessions.deleteExpired(session.accountId, at);
        expect(await repositories.sessions.get(expired)).toBeNull();
        expect(await repositories.sessions.get(tokenHash)).toEqual(session);
      });

      it("moves the end of a session", async () => {
        const session = await withAccount();
        await repositories.sessions.create(tokenHash, session, at);
        const later = new Date("2026-08-01T00:00:00.000Z");
        await repositories.sessions.extend(tokenHash, later);
        expect(await repositories.sessions.get(tokenHash)).toEqual({
          ...session,
          expiresAt: later,
        });
      });
    });

    describe("sign-in failures", () => {
      it("counts failures for a name until cleared", async () => {
        const first = new Date("2026-06-13T12:00:00.000Z");
        const second = new Date("2026-06-13T12:01:00.000Z");
        expect(await repositories.signInFailures.get("ana")).toBeNull();
        await repositories.signInFailures.record("ana", first);
        await repositories.signInFailures.record("ana", second);
        expect(await repositories.signInFailures.get("ana")).toEqual({
          failures: 2,
          lastFailureAt: second,
        });
        await repositories.signInFailures.clear("ana");
        expect(await repositories.signInFailures.get("ana")).toBeNull();
      });
    });

    describe("api key", () => {
      it("starts without a record", async () => {
        expect(await repositories.apiKey.get()).toBeNull();
      });

      it("keeps the latest record until it is deleted", async () => {
        const first = await seal("one", "pw");
        const second = await seal("two", "pw");
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
