import type { ColumnType, Generated, JSONColumnType } from "kysely";

type NullableJson = ColumnType<
  Record<string, unknown> | null,
  string | null,
  string | null
>;

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface SettingsTable {
  id: Generated<boolean>;
  data: JSONColumnType<Record<string, unknown>>;
}

export interface TimelineEntriesTable {
  id: string;
  type: "meal" | "fast_insulin" | "slow_insulin" | "glucose_reading";
  occurred_at: Timestamp;
  units: number | null;
  insulin_id: string | null;
  related_meal_id: string | null;
  glucose_value: number | null;
  glucose_unit: string | null;
  meal: NullableJson;
}

export interface FoodVocabularyTable {
  description_key: string;
  fdc_id: number;
  description: string;
  usda_description: string;
  default_weight_g: number;
  use_count: number;
  last_used: Timestamp;
}

export interface ApiKeyTable {
  id: Generated<boolean>;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export interface Database {
  settings: SettingsTable;
  timeline_entries: TimelineEntriesTable;
  food_vocabulary: FoodVocabularyTable;
  api_key: ApiKeyTable;
}
