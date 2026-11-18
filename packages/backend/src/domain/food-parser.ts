import type {
  CalculationStep,
  FoodVocabEntry,
  ParsedFoodItem,
  ParseTrace,
} from "@tashi/shared";
import type { AiConnection } from "./ai-connections.js";
import type { ModelUsage } from "./model-usage.js";

export type ParseOutcome = (
  | { status: "ok"; items: ParsedFoodItem[]; trace: ParseTrace }
  | {
      status: "needs_clarification";
      message: string;
      trace: ParseTrace;
    }
  | { status: "rejected"; message: string; trace: ParseTrace }
) & { usage: ModelUsage };

export interface FoodParser {
  parse(
    foodDescription: string,
    vocabulary: FoodVocabEntry[],
    language: "en" | "es",
    connection: AiConnection | null,
    onStep?: (step: CalculationStep) => void,
  ): Promise<ParseOutcome>;
}
