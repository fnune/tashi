import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CalculationResult, Settings } from "@pincho/shared";
import { DEFAULT_SETTINGS } from "@pincho/shared";

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
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(settings: Settings): Promise<void> {
    await writeFile(
      this.path("settings.json"),
      JSON.stringify(settings, null, 2),
    );
  }

  async getHistory(): Promise<CalculationResult[]> {
    try {
      const raw = await readFile(this.path("history.json"), "utf-8");
      return JSON.parse(raw) as CalculationResult[];
    } catch {
      return [];
    }
  }

  async addToHistory(result: CalculationResult): Promise<void> {
    const history = await this.getHistory();
    history.unshift(result);
    await writeFile(
      this.path("history.json"),
      JSON.stringify(history, null, 2),
    );
  }

  async deleteFromHistory(id: string): Promise<boolean> {
    const history = await this.getHistory();
    const filtered = history.filter((h) => h.id !== id);
    if (filtered.length === history.length) return false;
    await writeFile(
      this.path("history.json"),
      JSON.stringify(filtered, null, 2),
    );
    return true;
  }

  async clearHistory(): Promise<void> {
    await writeFile(this.path("history.json"), "[]");
  }
}
