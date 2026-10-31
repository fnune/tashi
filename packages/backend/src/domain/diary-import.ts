import type { FoodVocabEntry, Settings, TimelineEntry } from "@tashi/shared";
import type { Repositories } from "./repositories.js";

export class DiaryImport {
  constructor(private repositories: Repositories) {}

  async start(settings: Settings, vocabulary: FoodVocabEntry[]): Promise<void> {
    await this.repositories.timeline.clear();
    await this.repositories.vocabulary.clear();
    await this.repositories.settings.save(settings);
    await this.repositories.vocabulary.upsert(vocabulary);
  }

  async addEntries(entries: TimelineEntry[]): Promise<void> {
    await this.repositories.timeline.add(entries);
  }
}
