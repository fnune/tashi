import type { AiConnectionKind } from "./repositories.js";

export interface Model {
  id: string;
  kind: AiConnectionKind;
  label: string;
  prices: {
    input: number;
    cacheWrite: number;
    cacheRead: number;
    output: number;
  };
}

export const PRICES_CHECKED_ON = "2026-10-31";

// US dollars per million tokens, from platform.claude.com/docs/en/about-claude/pricing.
// Cache writes are the 5-minute kind; Haiku 5.5 is priced for prompts under
// 100,000 tokens, which a calculation never reaches.
export const MODELS: Model[] = [
  {
    id: "claude-haiku-5-5",
    kind: "anthropic",
    label: "Claude Haiku 5.5",
    prices: { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 },
  },
  {
    id: "claude-haiku-4-5",
    kind: "anthropic",
    label: "Claude Haiku 4.5",
    prices: { input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5 },
  },
  {
    id: "claude-sonnet-5-5",
    kind: "anthropic",
    label: "Claude Sonnet 5.5",
    prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 },
  },
  {
    id: "claude-sonnet-5",
    kind: "anthropic",
    label: "Claude Sonnet 5",
    prices: { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 },
  },
  {
    id: "claude-sonnet-4-6",
    kind: "anthropic",
    label: "Claude Sonnet 4.6",
    prices: { input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15 },
  },
  {
    id: "claude-opus-5-5",
    kind: "anthropic",
    label: "Claude Opus 5.5",
    prices: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 },
  },
];

export const DEFAULT_MODEL = "claude-haiku-5-5";

export function modelOf(id: string): Model | undefined {
  const undated = id.replace(/-\d{8}$/, "");
  return MODELS.find((model) => model.id === undated);
}
