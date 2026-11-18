import type { CalculationStep, InsulinOnBoard } from "@tashi/shared";
import { findMealWindow, insulinOnBoard } from "@tashi/shared";
import type { AiConnection } from "./ai-connections.js";
import type { CalculateOutcome, Calculator } from "./calculator.js";
import type { Clock } from "./clock.js";
import { DomainError } from "./errors.js";
import type { Repositories } from "./repositories.js";
import { fastInsulinEntries } from "./timeline.js";

export interface InsulinUnitsQuery {
  food_description: string;
  current_blood_sugar?: number;
  meal_window_override?: string;
}

export class InsulinUnits {
  constructor(
    private repositories: Repositories,
    private calculator: Calculator,
    private clock: Clock,
  ) {}

  async calculate(
    connection: AiConnection | null,
    query: InsulinUnitsQuery,
    timeZone?: string,
    onStep?: (step: CalculationStep) => void,
  ): Promise<CalculateOutcome> {
    const settings = await this.repositories.settings.get();
    if (settings.bolus_insulin_id === null) {
      throw new DomainError("bolus_insulin_not_configured");
    }
    if (
      !query.meal_window_override &&
      findMealWindow(settings, this.clock(), timeZone) === null
    ) {
      throw new DomainError("no_meal_window");
    }
    const vocabulary = await this.repositories.vocabulary.list();
    const iobUnits =
      settings.insulin_action_minutes === null
        ? 0
        : (await this.insulinOnBoard()).total_units;

    return this.calculator.calculate(
      connection,
      query.food_description,
      settings,
      query.current_blood_sugar,
      query.meal_window_override,
      vocabulary,
      iobUnits,
      timeZone,
      onStep,
    );
  }

  async insulinOnBoard(): Promise<InsulinOnBoard> {
    const settings = await this.repositories.settings.get();
    if (settings.insulin_action_minutes === null) {
      throw new DomainError("insulin_action_not_configured");
    }
    const now = this.clock();
    const recent = await this.repositories.timeline.since(
      new Date(now.getTime() - settings.insulin_action_minutes * 60_000),
    );
    return insulinOnBoard(fastInsulinEntries(recent), settings, now);
  }
}
