import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CalculatedItem,
  FoodVocabEntry,
  Settings,
  TimelineEntry,
} from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { z } from "zod";
import type { ApiKeyRecords } from "./api-key-store.js";
import { StoredDataError } from "./errors.js";
import {
  sealedSecretSchema,
  settingsSchema,
  storedTimelineSchema,
  storedVocabularySchema,
} from "./schemas.js";
import type { SealedSecret } from "./secret-box.js";
import { newestFirst } from "./timeline.js";

function isFileNotFound(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

export class FileStorage implements ApiKeyRecords {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  async init(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
  }

  private path(filename: string): string {
    return join(this.dataDir, filename);
  }

  private async read<T>(
    filename: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    whenMissing: T,
  ): Promise<T> {
    let raw: string;
    try {
      raw = await readFile(this.path(filename), "utf-8");
    } catch (e: unknown) {
      if (isFileNotFound(e)) return whenMissing;
      throw e;
    }
    try {
      return schema.parse(JSON.parse(raw));
    } catch (e) {
      throw new StoredDataError(filename, e);
    }
  }

  async getSettings(): Promise<Settings> {
    const stored = await this.read(
      "settings.json",
      z.record(z.string(), z.unknown()),
      {},
    );
    try {
      return settingsSchema.parse({ ...DEFAULT_SETTINGS, ...stored });
    } catch (e) {
      throw new StoredDataError("settings.json", e);
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await writeFile(
      this.path("settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }

  async getApiKeyRecord(): Promise<SealedSecret | null> {
    return this.read("api-key.json", sealedSecretSchema.nullable(), null);
  }

  async saveApiKeyRecord(record: SealedSecret): Promise<void> {
    await writeFile(this.path("api-key.json"), JSON.stringify(record), {
      mode: 0o600,
    });
  }

  async deleteApiKeyRecord(): Promise<void> {
    await rm(this.path("api-key.json"), { force: true });
  }

  async getTimeline(): Promise<TimelineEntry[]> {
    return this.read("timeline.json", storedTimelineSchema, []);
  }

  async addTimelineEntry(entry: TimelineEntry): Promise<void> {
    await this.addTimelineEntries([entry]);
  }

  async addTimelineEntries(entries: TimelineEntry[]): Promise<void> {
    const timeline = await this.getTimeline();
    await this.saveTimeline(newestFirst([...timeline, ...entries]));
  }

  async replaceTimelineEntry(entry: TimelineEntry): Promise<boolean> {
    const timeline = await this.getTimeline();
    if (!timeline.some((e) => e.id === entry.id)) return false;
    await this.saveTimeline(
      newestFirst(timeline.map((e) => (e.id === entry.id ? entry : e))),
    );
    return true;
  }

  async deleteTimelineEntry(id: string): Promise<boolean> {
    const timeline = await this.getTimeline();
    const filtered = timeline.filter((e) => e.id !== id);
    if (filtered.length === timeline.length) return false;
    await this.saveTimeline(filtered);
    return true;
  }

  async clearTimeline(): Promise<void> {
    await this.saveTimeline([]);
  }

  private async saveTimeline(entries: TimelineEntry[]): Promise<void> {
    await writeFile(
      this.path("timeline.json"),
      JSON.stringify(entries, null, 2),
    );
  }

  async getVocabulary(): Promise<FoodVocabEntry[]> {
    return this.read("food-vocab.json", storedVocabularySchema, []);
  }

  async learnFromItems(items: CalculatedItem[], now: Date): Promise<void> {
    const vocab = await this.getVocabulary();
    const usedAt = now.toISOString();

    for (const item of items) {
      if (!item.food_item || item.estimated) continue;

      const key = item.description.toLowerCase();
      const existing = vocab.find(
        (v) =>
          v.description.toLowerCase() === key &&
          v.fdc_id === item.food_item?.fdc_id,
      );

      if (existing) {
        existing.use_count++;
        existing.last_used = usedAt;
        existing.default_weight_g = item.weight_g;
      } else {
        vocab.push({
          description: item.description,
          fdc_id: item.food_item.fdc_id,
          usda_description: item.food_item.description,
          default_weight_g: item.weight_g,
          use_count: 1,
          last_used: usedAt,
        });
      }
    }

    await writeFile(
      this.path("food-vocab.json"),
      JSON.stringify(vocab, null, 2),
    );
  }
}
