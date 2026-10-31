import { z } from "zod";
import { foodItemSchema } from "../../domain/schemas.js";

export const ENTRIES_PER_SHARD = 128;
export const ID_SHARDS = 64;

export const manifestPath = "manifest.json";
export const entriesPath = (rank: number) =>
  `entries/${Math.floor(rank / ENTRIES_PER_SHARD)}.json`;
export const idsPath = (fdcId: number) => `ids/${fdcId % ID_SHARDS}.json`;
export const termsPath = (term: string) => `terms/${term.slice(0, 2)}.json`;

export const manifestSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});
export { foodItemSchema };
