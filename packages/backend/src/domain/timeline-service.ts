import type {
  FastInsulinEntry,
  GlucoseEntry,
  GlucoseUnit,
  LogMealResponse,
  SlowInsulinEntry,
  TimelineEntry,
  UpdateTimelineRequest,
} from "@tashi/shared";
import type { Clock } from "./clock.js";
import { DomainError } from "./errors.js";
import type { IdGenerator } from "./ids.js";
import type { Repositories } from "./repositories.js";
import { applyTimelineUpdate, type LoggableMeal, logMeal } from "./timeline.js";
import { learnVocabulary } from "./vocabulary.js";

export type NewEntry =
  | { type: "fast_insulin"; units: number }
  | { type: "slow_insulin"; units: number }
  | { type: "glucose_reading"; value: number; unit: GlucoseUnit };

export interface MealToLog {
  result: LoggableMeal;
  units: number;
  pre_bolus_minutes: number;
}

export class TimelineService {
  constructor(
    private repositories: Repositories,
    private clock: Clock,
    private newId: IdGenerator,
  ) {}

  async logMeal(meal: MealToLog): Promise<LogMealResponse> {
    const settings = await this.repositories.settings.get();
    if (settings.bolus_insulin_id === null) {
      throw new DomainError("bolus_insulin_not_configured");
    }
    const now = this.clock();
    const logged = logMeal(
      meal.result,
      meal.units,
      meal.pre_bolus_minutes,
      settings.bolus_insulin_id,
      now,
      this.newId,
    );
    await this.repositories.timeline.add(
      logged.insulin ? [logged.meal, logged.insulin] : [logged.meal],
    );
    await this.repositories.vocabulary.upsert(
      learnVocabulary(
        await this.repositories.vocabulary.list(),
        meal.result.items,
        now,
      ),
    );
    return {
      meal_entry_id: logged.meal.id,
      insulin_entry_id: logged.insulin?.id ?? null,
    };
  }

  async addEntry(data: NewEntry): Promise<TimelineEntry> {
    const base = { id: this.newId(), timestamp: this.clock().toISOString() };
    const settings = await this.repositories.settings.get();
    let entry: TimelineEntry;

    if (data.type === "fast_insulin") {
      if (settings.bolus_insulin_id === null) {
        throw new DomainError("bolus_insulin_not_configured");
      }
      entry = {
        ...base,
        type: "fast_insulin",
        units: data.units,
        insulin_id: settings.bolus_insulin_id,
        related_meal_id: null,
      } satisfies FastInsulinEntry;
    } else if (data.type === "slow_insulin") {
      if (settings.basal_insulin_id === null) {
        throw new DomainError("basal_insulin_not_configured");
      }
      entry = {
        ...base,
        type: "slow_insulin",
        units: data.units,
        insulin_id: settings.basal_insulin_id,
      } satisfies SlowInsulinEntry;
    } else {
      entry = {
        ...base,
        type: "glucose_reading",
        value: data.value,
        unit: data.unit,
      } satisfies GlucoseEntry;
    }
    await this.repositories.timeline.add([entry]);
    return entry;
  }

  async updateEntry(
    id: string,
    updates: UpdateTimelineRequest,
  ): Promise<TimelineEntry> {
    const existing = await this.repositories.timeline.get(id);
    if (!existing) throw new DomainError("not_found");
    const update = applyTimelineUpdate(existing, updates);
    if (update.status === "type_mismatch") throw new DomainError("not_found");
    if (update.status === "implausible_value") {
      throw new DomainError("validation_failed");
    }
    await this.repositories.timeline.replace(update.entry);
    return update.entry;
  }

  async deleteEntry(id: string): Promise<void> {
    if (!(await this.repositories.timeline.delete(id))) {
      throw new DomainError("not_found");
    }
  }

  clear(): Promise<void> {
    return this.repositories.timeline.clear();
  }
}
