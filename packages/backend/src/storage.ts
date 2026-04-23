import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CalculatedItem,
  FoodVocabEntry,
  Settings,
  TimelineEntry,
  UpdateTimelineRequest,
} from "@pincho/shared";
import { DEFAULT_SETTINGS } from "@pincho/shared";

function isFileNotFound(e: unknown): boolean {
  return e instanceof Error && "code" in e && e.code === "ENOENT";
}

export class FileStorage {
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

  async getSettings(): Promise<Settings> {
    try {
      const raw = await readFile(this.path("settings.json"), "utf-8");
      return JSON.parse(raw) as Settings;
    } catch (e: unknown) {
      if (isFileNotFound(e)) return { ...DEFAULT_SETTINGS };
      throw e;
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await writeFile(
      this.path("settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }

  async getTimeline(): Promise<TimelineEntry[]> {
    try {
      const raw = await readFile(this.path("timeline.json"), "utf-8");
      return JSON.parse(raw) as TimelineEntry[];
    } catch (e: unknown) {
      if (isFileNotFound(e)) return [];
      throw e;
    }
  }

  async addTimelineEntry(entry: TimelineEntry): Promise<void> {
    const timeline = await this.getTimeline();
    timeline.unshift(entry);
    timeline.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    await this.saveTimeline(timeline);
  }

  async addTimelineEntries(entries: TimelineEntry[]): Promise<void> {
    const timeline = await this.getTimeline();
    timeline.push(...entries);
    timeline.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    await this.saveTimeline(timeline);
  }

  async updateTimelineEntry(
    id: string,
    updates: UpdateTimelineRequest,
  ): Promise<TimelineEntry | null> {
    const timeline = await this.getTimeline();
    const idx = timeline.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const existing = timeline[idx];
    if (!existing || existing.type !== updates.type) return null;

    if (updates.timestamp) existing.timestamp = updates.timestamp;
    if (
      existing.type === "fast_insulin" &&
      updates.type === "fast_insulin" &&
      updates.units !== undefined
    ) {
      existing.units = updates.units;
    }
    if (
      existing.type === "slow_insulin" &&
      updates.type === "slow_insulin" &&
      updates.units !== undefined
    ) {
      existing.units = updates.units;
    }
    if (
      existing.type === "glucose_reading" &&
      updates.type === "glucose_reading" &&
      updates.value !== undefined
    ) {
      existing.value = updates.value;
    }

    timeline.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    await this.saveTimeline(timeline);
    return existing;
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
    try {
      const raw = await readFile(this.path("food-vocab.json"), "utf-8");
      return JSON.parse(raw) as FoodVocabEntry[];
    } catch (e: unknown) {
      if (isFileNotFound(e)) return [];
      throw e;
    }
  }

  async learnFromItems(items: CalculatedItem[]): Promise<void> {
    const vocab = await this.getVocabulary();
    const now = new Date().toISOString();

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
        existing.last_used = now;
        existing.default_weight_g = item.weight_g;
      } else {
        vocab.push({
          description: item.description,
          fdc_id: item.food_item.fdc_id,
          usda_description: item.food_item.description,
          default_weight_g: item.weight_g,
          use_count: 1,
          last_used: now,
        });
      }
    }

    await writeFile(
      this.path("food-vocab.json"),
      JSON.stringify(vocab, null, 2),
    );
  }
}
