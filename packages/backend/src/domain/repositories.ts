import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import type { SealedSecret } from "./secret-box.js";

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
}

export interface ApiKeyRepository {
  get(): Promise<SealedSecret | null>;
  save(record: SealedSecret): Promise<void>;
  delete(): Promise<void>;
}

export interface Repositories {
  settings: SettingsRepository;
  timeline: TimelineRepository;
  vocabulary: VocabularyRepository;
  apiKey: ApiKeyRepository;
}

export function cursorAfter(entry: TimelineEntry): TimelineCursor {
  return { occurredAt: new Date(entry.timestamp).toISOString(), id: entry.id };
}
