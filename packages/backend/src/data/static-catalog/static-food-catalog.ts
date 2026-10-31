import type { FoodItem } from "@tashi/shared";
import type {
  FoodCatalog,
  FoodSearchResult,
} from "../../domain/food-catalog.js";
import { foodItemSchema } from "../../domain/schemas.js";
import { StoredDataError } from "../stored-data-error.js";
import { ENTRIES_PER_SHARD, entriesPath } from "./layout.js";
import type { SearchIndex } from "./search-index.js";

export type ReadAsset = (path: string) => Promise<unknown>;

export class StaticFoodCatalog implements FoodCatalog {
  private shards = new Map<string, Promise<unknown>>();

  constructor(
    private index: SearchIndex,
    private readAsset: ReadAsset,
  ) {}

  async getByFdcId(fdcId: number): Promise<FoodItem | null> {
    const rank = this.index.rankOf(fdcId);
    return rank === undefined ? null : this.entry(rank);
  }

  async search(query: string, limit: number): Promise<FoodSearchResult[]> {
    return this.index.search(query, limit);
  }

  private async entry(rank: number): Promise<FoodItem | null> {
    const path = entriesPath(rank);
    const shard = await this.shard(path);
    if (!Array.isArray(shard)) {
      throw new StoredDataError(`catalog ${path}`, "not a list of foods");
    }
    const parsed = foodItemSchema.safeParse(shard[rank % ENTRIES_PER_SHARD]);
    if (!parsed.success) {
      throw new StoredDataError(`catalog ${path}`, parsed.error);
    }
    return parsed.data;
  }

  private shard(path: string): Promise<unknown> {
    const cached = this.shards.get(path);
    if (cached) return cached;
    const pending = this.readAsset(path);
    this.shards.set(path, pending);
    pending.catch(() => this.shards.delete(path));
    return pending;
  }
}
