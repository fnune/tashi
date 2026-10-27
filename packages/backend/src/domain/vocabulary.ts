import type { CalculatedItem, FoodVocabEntry } from "@tashi/shared";

export function sameVocabularyEntry(
  a: Pick<FoodVocabEntry, "description" | "fdc_id">,
  b: Pick<FoodVocabEntry, "description" | "fdc_id">,
): boolean {
  return (
    a.fdc_id === b.fdc_id &&
    a.description.toLowerCase() === b.description.toLowerCase()
  );
}

export function learnVocabulary(
  known: FoodVocabEntry[],
  items: CalculatedItem[],
  now: Date,
): FoodVocabEntry[] {
  const usedAt = now.toISOString();
  const learned: FoodVocabEntry[] = [];

  for (const item of items) {
    if (!item.food_item || item.estimated) continue;
    const key = {
      description: item.description,
      fdc_id: item.food_item.fdc_id,
    };
    const previous = [...learned, ...known].find((v) =>
      sameVocabularyEntry(v, key),
    );
    const entry: FoodVocabEntry = {
      description: previous?.description ?? item.description,
      fdc_id: key.fdc_id,
      usda_description:
        previous?.usda_description ?? item.food_item.description,
      default_weight_g: item.weight_g,
      use_count: (previous?.use_count ?? 0) + 1,
      last_used: usedAt,
    };
    const at = learned.findIndex((v) => sameVocabularyEntry(v, key));
    if (at === -1) learned.push(entry);
    else learned[at] = entry;
  }
  return learned;
}
