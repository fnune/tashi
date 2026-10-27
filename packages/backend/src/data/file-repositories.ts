import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import type { z } from "zod";
import { StoredDataError } from "../domain/errors.js";
import type {
  ApiKeyRepository,
  Repositories,
  SettingsRepository,
  TimelineRepository,
  VocabularyRepository,
} from "../domain/repositories.js";
import {
  parseStoredSettings,
  sealedSecretSchema,
  storedTimelineSchema,
  storedVocabularySchema,
} from "../schemas.js";
import type { SealedSecret } from "../domain/secret-box.js";
import { newestFirst } from "../domain/timeline.js";
import { sameVocabularyEntry } from "../domain/vocabulary.js";

function isFileNotFound(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

class JsonFile {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private path: string) {}

  exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async read<T>(parse: (json: unknown) => T, whenMissing: T): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf-8");
    } catch (e: unknown) {
      if (isFileNotFound(e)) return whenMissing;
      throw e;
    }
    try {
      return parse(JSON.parse(raw));
    } catch (e) {
      throw new StoredDataError(this.path, e);
    }
  }

  readWith<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, whenMissing: T) {
    return this.read((json) => schema.parse(json), whenMissing);
  }

  async write(value: unknown, mode?: number): Promise<void> {
    await writeFile(this.path, JSON.stringify(value, null, 2), { mode });
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true });
  }
}

class FileSettingsRepository implements SettingsRepository {
  constructor(private file: JsonFile) {}

  get(): Promise<Settings> {
    return this.file.read(parseStoredSettings, parseStoredSettings({}));
  }

  save(settings: Settings): Promise<void> {
    return this.file.write(settings);
  }
}

class FileTimelineRepository implements TimelineRepository {
  constructor(private file: JsonFile) {}

  list(): Promise<TimelineEntry[]> {
    return this.file.readWith(storedTimelineSchema, []);
  }

  async get(id: string): Promise<TimelineEntry | null> {
    return (await this.list()).find((e) => e.id === id) ?? null;
  }

  add(entries: TimelineEntry[]): Promise<void> {
    return this.file.exclusive(async () => {
      await this.save([...(await this.list()), ...entries]);
    });
  }

  replace(entry: TimelineEntry): Promise<boolean> {
    return this.file.exclusive(async () => {
      const timeline = await this.list();
      if (!timeline.some((e) => e.id === entry.id)) return false;
      await this.save(timeline.map((e) => (e.id === entry.id ? entry : e)));
      return true;
    });
  }

  delete(id: string): Promise<boolean> {
    return this.file.exclusive(async () => {
      const timeline = await this.list();
      const remaining = timeline.filter((e) => e.id !== id);
      if (remaining.length === timeline.length) return false;
      await this.save(remaining);
      return true;
    });
  }

  clear(): Promise<void> {
    return this.file.exclusive(() => this.save([]));
  }

  private save(entries: TimelineEntry[]): Promise<void> {
    return this.file.write(newestFirst(entries));
  }
}

class FileVocabularyRepository implements VocabularyRepository {
  constructor(private file: JsonFile) {}

  list(): Promise<FoodVocabEntry[]> {
    return this.file.readWith(storedVocabularySchema, []);
  }

  upsert(entries: FoodVocabEntry[]): Promise<void> {
    return this.file.exclusive(async () => {
      const vocabulary = await this.list();
      for (const entry of entries) {
        const at = vocabulary.findIndex((v) => sameVocabularyEntry(v, entry));
        if (at === -1) vocabulary.push(entry);
        else vocabulary[at] = entry;
      }
      await this.file.write(vocabulary);
    });
  }
}

class FileApiKeyRepository implements ApiKeyRepository {
  constructor(private file: JsonFile) {}

  get(): Promise<SealedSecret | null> {
    return this.file.readWith(sealedSecretSchema.nullable(), null);
  }

  save(record: SealedSecret): Promise<void> {
    return this.file.write(record, 0o600);
  }

  delete(): Promise<void> {
    return this.file.remove();
  }
}

export async function openFileRepositories(
  dataDir: string,
): Promise<Repositories> {
  await mkdir(dataDir, { recursive: true });
  const file = (name: string) => new JsonFile(join(dataDir, name));
  return {
    settings: new FileSettingsRepository(file("settings.json")),
    timeline: new FileTimelineRepository(file("timeline.json")),
    vocabulary: new FileVocabularyRepository(file("food-vocab.json")),
    apiKey: new FileApiKeyRepository(file("api-key.json")),
  };
}
