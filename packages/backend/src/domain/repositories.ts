import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import type { ModelUsage, ModelUsageTotal } from "./model-usage.js";
import type { Problem } from "./problems.js";

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
}

export interface TimelineCursor {
  occurredAt: string;
  id: string;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  next: TimelineCursor | null;
}

export interface TimelineRepository {
  page(options: {
    before?: TimelineCursor;
    limit: number;
  }): Promise<TimelinePage>;
  since(instant: Date): Promise<TimelineEntry[]>;
  get(id: string): Promise<TimelineEntry | null>;
  add(entries: TimelineEntry[]): Promise<void>;
  replace(entry: TimelineEntry): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

export interface VocabularyRepository {
  list(): Promise<FoodVocabEntry[]>;
  upsert(entries: FoodVocabEntry[]): Promise<void>;
  clear(): Promise<void>;
}

export type AiConnectionKind = "anthropic";

export interface StoredAiConnection {
  id: string;
  kind: AiConnectionKind;
  model: string;
  sealedApiKey: Uint8Array;
}

export interface AiConnectionRepository {
  get(kind: AiConnectionKind): Promise<StoredAiConnection | null>;
  replace(connection: StoredAiConnection, createdAt: Date): Promise<void>;
  setModel(kind: AiConnectionKind, model: string): Promise<boolean>;
  delete(kind: AiConnectionKind): Promise<void>;
}

export type AccountRole = "admin" | "member";

export interface Account {
  id: string;
  name: string;
  role: AccountRole;
}

export interface PasswordMethod {
  id: string;
  salt: Uint8Array;
  iterations: number;
  verifier: Uint8Array;
  wrappedDataKey: Uint8Array;
}

export interface AccountRepository {
  any(): Promise<boolean>;
  createFirst(
    account: Account,
    password: PasswordMethod,
    createdAt: Date,
  ): Promise<boolean>;
  withPassword(
    nameKey: string,
  ): Promise<{ account: Account; password: PasswordMethod } | null>;
  get(id: string): Promise<Account | null>;
}

export type SessionStage = "second_factor" | "signed_in";

export interface StoredSession {
  accountId: string;
  stage: SessionStage;
  expiresAt: Date;
  wrappedDataKey: Uint8Array;
}

export interface SessionRepository {
  create(
    tokenHash: Uint8Array,
    session: StoredSession,
    createdAt: Date,
  ): Promise<void>;
  get(tokenHash: Uint8Array): Promise<StoredSession | null>;
  extend(tokenHash: Uint8Array, expiresAt: Date): Promise<void>;
  delete(tokenHash: Uint8Array): Promise<void>;
  deleteExpired(accountId: string, now: Date): Promise<void>;
}

export interface SignInFailures {
  failures: number;
  lastFailureAt: Date;
}

export interface SignInFailureRepository {
  get(nameKey: string): Promise<SignInFailures | null>;
  record(nameKey: string, at: Date): Promise<void>;
  clear(nameKey: string): Promise<void>;
}

export interface ModelUsageRepository {
  record(usage: ModelUsage, at: Date): Promise<void>;
  totalsSince(since: Date): Promise<ModelUsageTotal[]>;
}

export interface ProblemRepository {
  record(problem: Problem, keep: number): Promise<void>;
  recent(): Promise<Problem[]>;
}

export interface Repositories {
  settings: SettingsRepository;
  timeline: TimelineRepository;
  vocabulary: VocabularyRepository;
  aiConnections: AiConnectionRepository;
  accounts: AccountRepository;
  sessions: SessionRepository;
  signInFailures: SignInFailureRepository;
  modelUsage: ModelUsageRepository;
  problems: ProblemRepository;
}

export function cursorAfter(entry: TimelineEntry): TimelineCursor {
  return { occurredAt: new Date(entry.timestamp).toISOString(), id: entry.id };
}
