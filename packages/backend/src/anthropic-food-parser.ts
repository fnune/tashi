import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFoodItem, SearchTraceEntry } from "@pincho/shared";
import type { FoodDatabase } from "./db/food-db.js";
import type { FoodParser, ParseResult } from "./food-parser.js";

const SYSTEM_PROMPT = `You are a food parsing assistant for a diabetes insulin calculator.

You will receive a food description (may be in English or Spanish). Your job:
1. Split it into individual food items with estimated weights in grams.
2. For EACH item, use the search_foods tool to find it in the USDA database. Try different search terms if the first attempt doesn't return a good match. Search in English using USDA-style naming (e.g. "rice white cooked", "chicken breast grilled").
3. Once you've found a good match for each item (or determined there is no match), return a final JSON array.

Rules:
- One row per food item. Never split fractional quantities ("1.5 avocados" = ONE item).
- If the user specifies "raw"/"dry"/"crudo"/"seco", set assumed_cooked to false. Otherwise true.
- confidence: "high" = explicit weight + clear food, "medium" = estimated portion, "low" = ambiguous.
- ALWAYS provide estimated_net_carbs_per_100g (net carbs EXCLUDING fibre) as a safety fallback.
- ALWAYS provide estimated_glycemic_index (0-100, glucose reference) unless negligible carbs (meat, oil, greens).
- Set warning for suspicious input (huge quantities, non-food items) in the user's language.

Your final response must be ONLY a JSON array:
[{
  "description": "human-readable name in user's language",
  "fdc_id": <number from search results, or null if no good match>,
  "weight_g": <number>,
  "assumed_cooked": <boolean>,
  "confidence": "high" | "medium" | "low",
  "notes": "<assumptions, in user's language, or null>",
  "estimated_net_carbs_per_100g": <number>,
  "estimated_glycemic_index": <number or null>,
  "warning": "<concern, in user's language, or null>"
}]`;

const SEARCH_TOOL: Anthropic.Messages.Tool = {
  name: "search_foods",
  description:
    "Search the USDA food database by keywords. Returns up to 10 matches ranked by relevance. Use English search terms.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description:
          'Search keywords in English, e.g. "rice white cooked" or "banana raw"',
      },
    },
    required: ["query"],
  },
};

const MAX_TOOL_ROUNDS = 10;

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const bracketStart = raw.indexOf("[");
  const bracketEnd = raw.lastIndexOf("]");
  if (bracketStart !== -1 && bracketEnd !== -1) {
    return raw.slice(bracketStart, bracketEnd + 1);
  }

  return raw.trim();
}

export class AnthropicFoodParser implements FoodParser {
  private client: Anthropic;
  private model: string;
  private foodDb: FoodDatabase;

  constructor(
    apiKey: string,
    foodDb: FoodDatabase,
    model = "claude-haiku-4-5-20251001",
  ) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.foodDb = foodDb;
  }

  async parse(foodDescription: string): Promise<ParseResult> {
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: foodDescription },
    ];

    const searches: SearchTraceEntry[] = [];
    const startMs = Date.now();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        tools: [SEARCH_TOOL],
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const text = response.content.find((b) => b.type === "text");
        if (!text || text.type !== "text") {
          throw new Error("No text in final LLM response");
        }
        const rawResponse = text.text;
        const jsonStr = extractJson(rawResponse);
        const parsed: unknown = JSON.parse(jsonStr);
        if (!Array.isArray(parsed)) {
          throw new Error("LLM response is not an array");
        }
        return {
          items: parsed as ParsedFoodItem[],
          trace: {
            searches,
            raw_response: rawResponse,
            model: this.model,
            duration_ms: Date.now() - startMs,
          },
        };
      }

      if (response.stop_reason !== "tool_use") {
        throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
      }

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "search_foods") {
          const input = block.input as { query: string };
          const results = this.foodDb.search(input.query, 10);
          const formatted = results.map((r) => ({
            fdc_id: r.fdc_id,
            description: r.description,
            category: r.category,
            net_carbs_per_100g: r.net_carbs_per_100g,
            fiber_per_100g: r.fiber_per_100g,
            match_count: r.match_count,
          }));

          searches.push({
            query: input.query,
            results: formatted.map((r) => ({
              fdc_id: r.fdc_id,
              description: r.description,
              net_carbs_per_100g: r.net_carbs_per_100g,
            })),
          });

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(formatted),
          });
        }
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error("LLM exceeded maximum tool call rounds");
  }
}
