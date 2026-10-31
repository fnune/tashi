import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import {
  cursorAfter,
  type Repositories,
  type TimelineCursor,
} from "../domain/repositories.js";
import type { SealedSecret } from "../domain/secret-box.js";
import { sameVocabularyEntry } from "../domain/vocabulary.js";

function newestFirst(a: TimelineEntry, b: TimelineEntry): number {
  const byTime = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  return byTime !== 0 ? byTime : b.id.localeCompare(a.id);
}

function isBefore(entry: TimelineEntry, cursor: TimelineCursor): boolean {
  const cursorTime = Date.parse(cursor.occurredAt);
  const time = Date.parse(entry.timestamp);
  return time < cursorTime || (time === cursorTime && entry.id < cursor.id);
}

export function createInMemoryRepositories(): Repositories {
  let settings: Settings = structuredClone(DEFAULT_SETTINGS);
  let timeline: TimelineEntry[] = [];
  const vocabulary: FoodVocabEntry[] = [];
  let apiKey: SealedSecret | null = null;

  return {
    settings: {
      get: async () => structuredClone(settings),
      save: async (next) => {
        settings = structuredClone(next);
      },
    },
    timeline: {
      page: async ({ before, limit }) => {
        const sorted = [...timeline].sort(newestFirst);
        const rest = before
          ? sorted.filter((entry) => isBefore(entry, before))
          : sorted;
        const entries = rest.slice(0, limit).map((e) => structuredClone(e));
        const last = entries.at(-1);
        return {
          entries,
          next: rest.length > limit && last ? cursorAfter(last) : null,
        };
      },
      since: async (instant) =>
        timeline
          .filter((entry) => Date.parse(entry.timestamp) >= instant.getTime())
          .sort(newestFirst)
          .map((e) => structuredClone(e)),
      get: async (id) => {
        const found = timeline.find((entry) => entry.id === id);
        return found ? structuredClone(found) : null;
      },
      add: async (entries) => {
        timeline = [...timeline, ...structuredClone(entries)];
      },
      replace: async (entry) => {
        if (!timeline.some((e) => e.id === entry.id)) return false;
        timeline = timeline.map((e) =>
          e.id === entry.id ? structuredClone(entry) : e,
        );
        return true;
      },
      delete: async (id) => {
        const before = timeline.length;
        timeline = timeline.filter((e) => e.id !== id);
        timeline = timeline.map((e) =>
          e.type === "fast_insulin" && e.related_meal_id === id
            ? { ...e, related_meal_id: null }
            : e,
        );
        return timeline.length !== before;
      },
      clear: async () => {
        timeline = [];
      },
    },
    vocabulary: {
      list: async () => structuredClone(vocabulary),
      upsert: async (entries) => {
        for (const entry of structuredClone(entries)) {
          const at = vocabulary.findIndex((v) => sameVocabularyEntry(v, entry));
          if (at === -1) vocabulary.push(entry);
          else vocabulary[at] = entry;
        }
      },
      clear: async () => {
        vocabulary.length = 0;
      },
    },
    apiKey: {
      get: async () => (apiKey ? { ...apiKey } : null),
      save: async (record) => {
        apiKey = { ...record };
      },
      delete: async () => {
        apiKey = null;
      },
    },
  };
}
