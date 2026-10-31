import type { FoodSearchResult } from "../../domain/food-catalog.js";
import { StoredDataError } from "../stored-data-error.js";
import { termsOf } from "./terms.js";

export type FoodSummary = [
  fdcId: number,
  description: string,
  category: string | null,
  netCarbs: number,
  fibre: number | null,
  fat: number | null,
  protein: number | null,
];

export interface SearchIndexData {
  label: string;
  summaries: FoodSummary[];
  terms: Record<string, number[]>;
}

export class SearchIndex {
  private ranksByFdcId = new Map<number, number>();

  private constructor(private data: SearchIndexData) {
    data.summaries.forEach(([fdcId], rank) => {
      if (!this.ranksByFdcId.has(fdcId)) this.ranksByFdcId.set(fdcId, rank);
    });
  }

  static parse(content: unknown): SearchIndex {
    return new SearchIndex(searchIndexDataOf(content));
  }

  get label(): string {
    return this.data.label;
  }

  rankOf(fdcId: number): number | undefined {
    return this.ranksByFdcId.get(fdcId);
  }

  search(query: string, limit: number): FoodSearchResult[] {
    const counts = new Map<number, number>();
    for (const term of termsOf(query)) {
      for (const rank of this.data.terms[term] ?? []) {
        counts.set(rank, (counts.get(rank) ?? 0) + 1);
      }
    }
    return mostMatched(counts, limit).flatMap(([rank, matchCount]) => {
      const summary = this.data.summaries[rank];
      return summary ? [resultOf(summary, matchCount)] : [];
    });
  }
}

function resultOf(
  [fdcId, description, category, netCarbs, fibre, fat, protein]: FoodSummary,
  matchCount: number,
): FoodSearchResult {
  return {
    fdc_id: fdcId,
    description,
    category,
    net_carbs_per_100g: netCarbs,
    fiber_per_100g: fibre,
    fat_per_100g: fat,
    protein_per_100g: protein,
    match_count: matchCount,
  };
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

const isNumberOrNull = (value: unknown) =>
  value === null || typeof value === "number";

function isFoodSummary(value: unknown): value is FoodSummary {
  return (
    Array.isArray(value) &&
    value.length === 7 &&
    Number.isInteger(value[0]) &&
    typeof value[1] === "string" &&
    (value[2] === null || typeof value[2] === "string") &&
    typeof value[3] === "number" &&
    isNumberOrNull(value[4]) &&
    isNumberOrNull(value[5]) &&
    isNumberOrNull(value[6])
  );
}

function isRankList(value: unknown, foods: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((rank) => Number.isInteger(rank) && rank >= 0 && rank < foods)
  );
}

function searchIndexDataOf(content: unknown): SearchIndexData {
  const invalid = (problem: string) =>
    new StoredDataError("catalog search index", problem);
  if (
    typeof content !== "object" ||
    content === null ||
    !("label" in content) ||
    !("summaries" in content) ||
    !("terms" in content)
  ) {
    throw invalid("missing label, summaries or terms");
  }
  const { label, summaries, terms } = content;
  if (typeof label !== "string" || label === "") throw invalid("empty label");
  if (!Array.isArray(summaries) || !summaries.every(isFoodSummary)) {
    throw invalid("a summary is not a food summary");
  }
  if (typeof terms !== "object" || terms === null) throw invalid("no terms");
  const ranksByTerm: Record<string, number[]> = {};
  for (const [term, ranks] of Object.entries(terms)) {
    if (!isRankList(ranks, summaries.length)) {
      throw invalid(`term ${term} points at foods that do not exist`);
    }
    ranksByTerm[term] = ranks;
  }
  return { label, summaries, terms: ranksByTerm };
}
