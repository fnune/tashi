import { readFile } from "node:fs/promises";
import { join } from "node:path";
import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { CURATED_USDA, type CuratedFood } from "./curated-foods.js";

const FOODS_DB = join(import.meta.dirname, "../../../data/foods.db");
const WASM = join(
  import.meta.dirname,
  "../node_modules/sql.js/dist/sql-wasm.wasm",
);

const STATE_WORDS = new Set([
  "cooked",
  "grilled",
  "baked",
  "boiled",
  "canned",
  "plain",
  "mixed",
  "normal",
]);

const ENGLISH_FOR: Record<string, RegExp> = {
  brown: /brown/i,
  cornflakes: /corn flakes/i,
  bun: /roll/i,
  fries: /french fried/i,
  ketchup: /catsup/i,
  loin: /loin/i,
  margherita: /./,
  nigiri: /./,
  sushi: /rice/i,
  oats: /oat/i,
  salad: /lettuce/i,
  sauce: /sauce/i,
  semi: /1%|2%|lowfat|reduced fat/i,
  sugar: /sugar/i,
  tomato: /tomato|marinara/i,
  toast: /bread/i,
  white: /white|granulated/i,
  wholegrain: /whole/i,
  cola: /cola/i,
  coca: /cola/i,
};

const COOKED_NAME = /cooked|cocid[oa]s?|hervid[oa]s?/i;
const UNCOOKED_DESCRIPTION = /\b(raw|dry|dried|uncooked|unprepared)\b/i;

let descriptions: Map<number, string>;
let curatedIds: Map<string, number>;

beforeAll(async () => {
  const SQL = await initSqlJs({
    locateFile: () => "sql-wasm.wasm",
    wasmBinary: await readFile(WASM),
  });
  const db = new SQL.Database(await readFile(FOODS_DB));
  descriptions = new Map();
  for (const [id, description] of db.exec(
    "SELECT fdc_id, description FROM foods",
  )[0]!.values) {
    descriptions.set(id as number, description as string);
  }
  curatedIds = new Map();
  for (const [id, custom] of db.exec(
    "SELECT fdc_id, custom_id FROM curated",
  )[0]!.values) {
    curatedIds.set(custom as string, id as number);
  }
  db.close();
});

function descriptionOf(food: CuratedFood): string {
  return descriptions.get(food.fdc_id) ?? "";
}

function foodWords(customId: string): string[] {
  return customId.split("_").filter((word) => !STATE_WORDS.has(word));
}

function wordPattern(word: string): RegExp {
  return ENGLISH_FOR[word] ?? new RegExp(word.replace(/s$/, ""), "i");
}

describe("curated USDA overlay", () => {
  it("points every entry at a food that exists in the catalog", () => {
    const missing = CURATED_USDA.filter(
      (food) => !descriptions.has(food.fdc_id),
    ).map((food) => `${food.custom_id} -> ${food.fdc_id}`);
    expect(missing).toEqual([]);
  });

  it("gives every entry its own USDA food, since the overlay table keys on it", () => {
    const owners = new Map<number, string>();
    const shared: string[] = [];
    for (const food of CURATED_USDA) {
      const owner = owners.get(food.fdc_id);
      if (owner)
        shared.push(`${food.custom_id} shares ${food.fdc_id} with ${owner}`);
      else owners.set(food.fdc_id, food.custom_id);
    }
    expect(shared).toEqual([]);
  });

  it("ships every entry in the built catalog with the same fdc_id", () => {
    const stale = CURATED_USDA.filter(
      (food) => curatedIds.get(food.custom_id) !== food.fdc_id,
    ).map((food) => food.custom_id);
    expect(stale).toEqual([]);
  });

  it("never points a cooked food at a raw or dry USDA food", () => {
    const cooked = CURATED_USDA.filter(
      (food) =>
        COOKED_NAME.test(food.custom_id) || COOKED_NAME.test(food.name_es),
    );
    expect(cooked.length).toBeGreaterThan(10);
    const uncooked = cooked
      .filter((food) =>
        UNCOOKED_DESCRIPTION.test(descriptionOf(food).replace(/dry heat/i, "")),
      )
      .map(
        (food) =>
          `${food.custom_id} -> ${food.fdc_id} "${descriptionOf(food)}"`,
      );
    expect(uncooked).toEqual([]);
  });

  it("points every entry at the food it is named after", () => {
    const wrong: string[] = [];
    for (const food of CURATED_USDA) {
      const description = descriptionOf(food);
      for (const word of foodWords(food.custom_id)) {
        if (!wordPattern(word).test(description)) {
          wrong.push(
            `${food.custom_id} -> ${food.fdc_id} "${description}" lacks "${word}"`,
          );
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
