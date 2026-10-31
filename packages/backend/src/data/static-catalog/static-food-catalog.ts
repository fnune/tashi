import type { FoodItem } from "@tashi/shared";
import type { z } from "zod";
import type { FoodCatalog, FoodMatch } from "../../domain/food-catalog.js";
import { StoredDataError } from "../stored-data-error.js";
import {
  ENTRIES_PER_SHARD,
  entriesPath,
  foodItemSchema,
  idsPath,
  termsPath,
} from "./layout.js";
import { termsOf } from "./terms.js";

export type ReadAsset = (path: string) => Promise<unknown>;

export class StaticFoodCatalog implements FoodCatalog {
  private files = new Map<string, Promise<unknown>>();

  constructor(private readAsset: ReadAsset) {}

  async getByFdcId(fdcId: number): Promise<FoodItem | null> {
    const [rank] = await this.ranks(idsPath(fdcId), String(fdcId));
    return rank === undefined ? null : this.entry(rank);
  }

  async search(query: string, limit: number): Promise<FoodMatch[]> {
    const counts = new Map<number, number>();
    for (const term of termsOf(query)) {
      for (const rank of await this.ranks(termsPath(term), term)) {
        counts.set(rank, (counts.get(rank) ?? 0) + 1);
      }
    }
    const best = mostMatched(counts, limit);
    const matches = await Promise.all(
      best.map(async ([rank, matchCount]) => {
        const item = await this.entry(rank);
        return item ? { ...item, match_count: matchCount } : null;
      }),
    );
    return matches.filter((match) => match !== null);
  }

  private async ranks(path: string, key: string): Promise<number[]> {
    const index = await this.file(path);
    if (index === null) return [];
    if (typeof index !== "object" || Array.isArray(index)) {
      throw new StoredDataError(`catalog ${path}`, "not an index");
    }
    if (!Object.hasOwn(index, key)) return [];
    const ranks: unknown = Reflect.get(index, key);
    if (!isRankList(ranks)) {
      throw new StoredDataError(`catalog ${path}`, `bad ranks for ${key}`);
    }
    return ranks;
  }

  private async entry(rank: number): Promise<FoodItem | null> {
    const path = entriesPath(rank);
    const shard = await this.file(path);
    if (shard === null) return null;
    if (!Array.isArray(shard)) {
      throw new StoredDataError(`catalog ${path}`, "not a list of foods");
    }
    const item: unknown = shard[rank % ENTRIES_PER_SHARD];
    return item === undefined ? null : this.parsed(path, foodItemSchema, item);
  }

  private file(path: string): Promise<unknown> {
    const cached = this.files.get(path);
    if (cached) return cached;
    const pending = this.readAsset(path);
    this.files.set(path, pending);
    pending.catch(() => this.files.delete(path));
    return pending;
  }

  private parsed<T>(path: string, schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) {
      throw new StoredDataError(`catalog ${path}`, result.error);
    }
    return result.data;
  }
}

function isRankList(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((rank) => Number.isInteger(rank) && rank >= 0)
  );
}

function mostMatched(
  counts: Map<number, number>,
  limit: number,
): [rank: number, matchCount: number][] {
  const byCount: number[][] = [];
  for (const [rank, count] of counts) {
    const bucket = byCount[count] ?? [];
    bucket.push(rank);
    byCount[count] = bucket;
  }
  const best: [number, number][] = [];
  for (
    let count = byCount.length - 1;
    count > 0 && best.length < limit;
    count--
  ) {
    const ranks = Int32Array.from(byCount[count] ?? []).sort();
    for (const rank of ranks.subarray(0, limit - best.length)) {
      best.push([rank, count]);
    }
  }
  return best;
}
