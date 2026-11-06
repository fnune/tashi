import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { nameKeyOf } from "../domain/auth/authentication.js";
import type { ModelUsage, ModelUsageTotal } from "../domain/model-usage.js";
import type { Problem } from "../domain/problems.js";
import {
  type Account,
  cursorAfter,
  type PasswordMethod,
  type Repositories,
  type SignInFailures,
  type StoredAiConnection,
  type StoredSession,
  type TimelineCursor,
} from "../domain/repositories.js";
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
  const aiConnections = new Map<string, StoredAiConnection>();
  const accounts = new Map<
    string,
    { account: Account; password: PasswordMethod }
  >();
  const sessions = new Map<string, StoredSession>();
  const failures = new Map<string, SignInFailures>();
  const usage: { usage: ModelUsage; at: Date }[] = [];
  let problems: Problem[] = [];
  const keyOf = (bytes: Uint8Array) => [...bytes].join(",");

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
    aiConnections: {
      get: async (kind) => structuredClone(aiConnections.get(kind) ?? null),
      replace: async (connection) => {
        aiConnections.set(connection.kind, structuredClone(connection));
      },
      setModel: async (kind, model) => {
        const connection = aiConnections.get(kind);
        if (connection) connection.model = model;
        return connection !== undefined;
      },
      delete: async (kind) => {
        aiConnections.delete(kind);
      },
    },
    accounts: {
      any: async () => accounts.size > 0,
      createFirst: async (account, password) => {
        if (accounts.size > 0) return false;
        accounts.set(
          nameKeyOf(account.name),
          structuredClone({ account, password }),
        );
        return true;
      },
      withPassword: async (nameKey) =>
        structuredClone(accounts.get(nameKey) ?? null),
      get: async (id) =>
        structuredClone(
          [...accounts.values()].find((a) => a.account.id === id)?.account ??
            null,
        ),
    },
    sessions: {
      create: async (tokenHash, session) => {
        sessions.set(keyOf(tokenHash), structuredClone(session));
      },
      get: async (tokenHash) =>
        structuredClone(sessions.get(keyOf(tokenHash)) ?? null),
      extend: async (tokenHash, expiresAt) => {
        const session = sessions.get(keyOf(tokenHash));
        if (session) session.expiresAt = expiresAt;
      },
      delete: async (tokenHash) => {
        sessions.delete(keyOf(tokenHash));
      },
      deleteExpired: async (accountId, now) => {
        for (const [key, session] of sessions) {
          if (session.accountId === accountId && session.expiresAt <= now) {
            sessions.delete(key);
          }
        }
      },
    },
    signInFailures: {
      get: async (nameKey) => structuredClone(failures.get(nameKey) ?? null),
      record: async (nameKey, at) => {
        const known = failures.get(nameKey);
        failures.set(nameKey, {
          failures: (known?.failures ?? 0) + 1,
          lastFailureAt: at,
        });
      },
      clear: async (nameKey) => {
        failures.delete(nameKey);
      },
    },
    modelUsage: {
      record: async (recorded, at) => {
        usage.push({ usage: { ...recorded }, at });
      },
      totalsSince: async (since) => {
        const totals = new Map<string, ModelUsageTotal>();
        for (const { usage: u, at } of usage) {
          if (at < since) continue;
          const total = totals.get(u.model) ?? {
            model: u.model,
            calculations: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
          };
          total.calculations += 1;
          total.inputTokens += u.inputTokens;
          total.outputTokens += u.outputTokens;
          total.cacheWriteTokens += u.cacheWriteTokens;
          total.cacheReadTokens += u.cacheReadTokens;
          totals.set(u.model, total);
        }
        return [...totals.values()].sort((a, b) =>
          a.model.localeCompare(b.model),
        );
      },
    },
    problems: {
      record: async (problem, keep) => {
        problems = [structuredClone(problem), ...problems].slice(0, keep);
      },
      recent: async () => structuredClone(problems),
    },
  };
}
