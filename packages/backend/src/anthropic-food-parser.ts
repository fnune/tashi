import Anthropic from "@anthropic-ai/sdk";
import type { ParsedFoodItem } from "@pincho/shared";
import type { FoodParser } from "./food-parser.js";

const SYSTEM_PROMPT = `You are a food parsing assistant for a diabetes insulin calculator. Your job is to parse natural language food descriptions into structured data.

You will receive:
1. A food description from the user (may be in English or Spanish)
2. A food database index listing all available food items with their keys

Your task:
- Split the description into individual food items
- For each item, estimate the weight in grams
- Match each item to the closest key in the food database index
- If the user specifies "raw", "dry", or "crudo/seco" weight, set assumed_cooked to false. Otherwise default to true (cooked/as-served weight).
- Set confidence: "high" if the user gave an explicit weight and the food clearly matches a DB entry, "medium" if you had to estimate a typical portion, "low" if the food is ambiguous or doesn't match well.

When a food item does NOT match any key in the database index:
- Set db_key to null
- Provide your best estimate of net carbs per 100g in estimated_net_carbs_per_100g (carbohydrates EXCLUDING fibre)
- This estimate will be clearly marked to the user as an LLM estimate, not from a verified database

When the user's input seems obviously wrong or unusual:
- Set warning to a short explanation in the user's language
- Examples: unrealistic quantities ("500g of sugar in coffee"), contradictions ("sugar-free honey"), items that are not food
- Still process the item if it's food, but flag the concern

Respond with ONLY a JSON array, no other text. Each element:
{
  "description": "human-readable name of the food item in the user's input language",
  "weight_g": <number>,
  "db_key": "<key from the food index, or null if no good match>",
  "assumed_cooked": <boolean>,
  "confidence": "high" | "medium" | "low",
  "notes": "<any assumption you made, in the user's input language, or null>",
  "estimated_net_carbs_per_100g": <number or null, only when db_key is null>,
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

  async parse(
    foodDescription: string,
    foodIndex: string,
  ): Promise<ParsedFoodItem[]> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Food database index:\n${foodIndex}\n\nFood description:\n${foodDescription}`,
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
