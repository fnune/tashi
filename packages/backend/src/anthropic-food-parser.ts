import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFoodItem } from "@pincho/shared";
import type { FoodParser } from "./food-parser.js";

const SYSTEM_PROMPT = `You are a food parsing assistant for a diabetes insulin calculator. Your job is to parse natural language food descriptions into structured data.

You will receive a food description from the user (may be in English or Spanish).

Your task:
- Split the description into individual food items
- For each item, estimate the weight in grams
- Provide a standardized English food description for database lookup in search_text. Use common USDA-style naming: "Rice, white, long-grain, cooked" not "arroz blanco". Include cooking state (raw/cooked) when relevant.
- If the user specifies "raw", "dry", or "crudo/seco" weight, set assumed_cooked to false. Otherwise default to true (cooked/as-served weight).
- Set confidence: "high" if the user gave an explicit weight and the food is common, "medium" if you had to estimate a typical portion, "low" if the food is ambiguous.
- Always output one row per food item. Never split fractional quantities into separate rows. "1.5 avocados" is ONE item with the combined weight, not two items.

ALWAYS provide estimated_net_carbs_per_100g for EVERY food item (your best estimate of net carbs per 100g, carbohydrates EXCLUDING fibre). This serves as a safety fallback when the database search finds no match.

For ALL food items:
- Provide your best estimate of the glycemic index (0-100+ scale, glucose reference) in estimated_glycemic_index
- Use your knowledge of published GI tables (Sydney University, international GI tables)
- Set to null only for items with negligible carbs (e.g. plain meat, oils, leafy greens)

When the user's input seems obviously wrong or unusual:
- Set warning to a short explanation in the user's language
- Examples: unrealistic quantities ("500g of sugar in coffee"), contradictions ("sugar-free honey"), items that are not food
- Still process the item if it's food, but flag the concern

Respond with ONLY a JSON array, no other text. Each element:
{
  "description": "human-readable name of the food item in the user's input language",
  "search_text": "standardized English food description for USDA database lookup",
  "weight_g": <number>,
  "assumed_cooked": <boolean>,
  "confidence": "high" | "medium" | "low",
  "notes": "<any assumption you made, in the user's input language, or null>",
  "estimated_net_carbs_per_100g": <number, always provided as safety fallback>,
  "estimated_glycemic_index": <number or null>,
  "warning": "<concern about the input, in the user's language, or null>"
}`;

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

  constructor(apiKey: string, model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async parse(foodDescription: string): Promise<ParsedFoodItem[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: foodDescription,
        },
      ],
    });

    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("No text response from LLM");
    }

    const jsonStr = extractJson(text.text);
    const parsed: unknown = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      throw new Error("LLM response is not an array");
    }

    return parsed as ParsedFoodItem[];
  }
}
