import type {
  FoodVocabEntry,
  ParsedFoodItem,
  ParseTrace,
} from "@pincho/shared";

export type ParseOutcome =
  | { status: "ok"; items: ParsedFoodItem[]; trace: ParseTrace }
  | {
      status: "needs_clarification";
      message: string;
      trace: ParseTrace;
    }
  | { status: "rejected"; message: string; trace: ParseTrace };

export interface FoodParser {
  parse(
    foodDescription: string,
    vocabulary: FoodVocabEntry[],
    language: "en" | "es",
  ): Promise<ParseOutcome>;
}
