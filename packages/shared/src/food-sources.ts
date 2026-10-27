export const FOOD_SOURCES = {
  usda_sr_legacy: {
    dataSource: "sr_legacy_food",
    catalog: true,
    estimate: false,
  },
  usda_foundation: {
    dataSource: "foundation_food",
    catalog: true,
    estimate: false,
  },
  usda_survey: {
    dataSource: "survey_fndds_food",
    catalog: true,
    estimate: false,
  },
  curated: { dataSource: "curated", catalog: true, estimate: false },
  usda_unspecified: {
    dataSource: "USDA FoodData Central",
    catalog: false,
    estimate: false,
  },
  sugirs: { dataSource: "SUGiRS", catalog: false, estimate: false },
  llm_estimate: { dataSource: "LLM estimate", catalog: false, estimate: true },
  user: { dataSource: "user", catalog: false, estimate: false },
  unknown: { dataSource: "unknown", catalog: false, estimate: false },
} as const;

export type FoodSourceId = keyof typeof FOOD_SOURCES;

export const FOOD_SOURCE_IDS = Object.keys(FOOD_SOURCES) as [
  FoodSourceId,
  ...FoodSourceId[],
];

export const DATA_SOURCE_LABELS = FOOD_SOURCE_IDS.map(
  (id) => FOOD_SOURCES[id].dataSource,
) as [string, ...string[]];

export function foodSourceOfDataSource(dataSource: string): FoodSourceId {
  const id = FOOD_SOURCE_IDS.find(
    (candidate) => FOOD_SOURCES[candidate].dataSource === dataSource,
  );
  if (!id) throw new Error(`Unknown data source: ${dataSource}`);
  return id;
}

export function dataSourceOfFoodSource(id: FoodSourceId): string {
  return FOOD_SOURCES[id].dataSource;
}
