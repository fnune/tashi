import {
  DIARY_FORMAT,
  DIARY_VERSION,
  type Diary,
  type FoodVocabEntry,
  IMPORT_ENTRIES_PER_REQUEST,
  type ImportEntriesRequest,
  type Settings,
  type StartImportRequest,
  type TimelineEntry,
} from "./types.js";

export interface DiaryApi {
  settings(): Promise<Settings>;
  vocabulary(): Promise<FoodVocabEntry[]>;
  timelinePage(
    cursor: string | null,
  ): Promise<{ entries: TimelineEntry[]; next: string | null }>;
  startImport(request: StartImportRequest): Promise<void>;
  importEntries(request: ImportEntriesRequest): Promise<void>;
}

export async function exportDiary(
  api: DiaryApi,
  exportedAt: Date,
): Promise<Diary> {
  const timeline: TimelineEntry[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.timelinePage(cursor);
    timeline.push(...page.entries);
    cursor = page.next;
  } while (cursor !== null);
  return {
    format: DIARY_FORMAT,
    version: DIARY_VERSION,
    exported_at: exportedAt.toISOString(),
    settings: await api.settings(),
    vocabulary: await api.vocabulary(),
    timeline,
  };
}

export async function importDiary(
  api: DiaryApi,
  diary: Diary,
  onProgress: (imported: number, total: number) => void = () => {},
): Promise<void> {
  const mealsFirst = [
    ...diary.timeline.filter((entry) => entry.type === "meal"),
    ...diary.timeline.filter((entry) => entry.type !== "meal"),
  ];
  await api.startImport({
    settings: diary.settings,
    vocabulary: diary.vocabulary,
  });
  onProgress(0, mealsFirst.length);
  for (
    let start = 0;
    start < mealsFirst.length;
    start += IMPORT_ENTRIES_PER_REQUEST
  ) {
    const entries = mealsFirst.slice(start, start + IMPORT_ENTRIES_PER_REQUEST);
    await api.importEntries({ entries });
    onProgress(start + entries.length, mealsFirst.length);
  }
}

export type DiaryReading =
  | { ok: true; diary: Diary }
  | { ok: false; problem: "not_json" | "not_a_diary" | "newer_version" };

export function readDiary(text: string): DiaryReading {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problem: "not_json" };
  }
  if (!isRecord(value) || value.format !== DIARY_FORMAT) {
    return { ok: false, problem: "not_a_diary" };
  }
  if (typeof value.version !== "number" || value.version > DIARY_VERSION) {
    return { ok: false, problem: "newer_version" };
  }
  const upgraded = {
    ...value,
    timeline: Array.isArray(value.timeline)
      ? value.timeline.map(renameLegacyFields)
      : value.timeline,
  };
  return looksLikeDiary(upgraded)
    ? { ok: true, diary: upgraded }
    : { ok: false, problem: "not_a_diary" };
}

const LEGACY_FIELDS = {
  carb_dose: "carb_units",
  total_dose: "total_units",
  correction_dose: "correction_units",
  adjustment_dose: "adjustment_units",
} as const;

function renameFields(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [
      key in LEGACY_FIELDS
        ? LEGACY_FIELDS[key as keyof typeof LEGACY_FIELDS]
        : key,
      field,
    ]),
  );
}

function renameLegacyFields(entry: unknown): unknown {
  const renamed = renameFields(entry);
  if (!isRecord(renamed)) return renamed;
  for (const part of ["correction", "fat_protein_adjustment"]) {
    if (part in renamed) renamed[part] = renameFields(renamed[part]);
  }
  return renamed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeDiary(
  value: Record<string, unknown>,
): value is Diary & Record<string, unknown> {
  return (
    value.version === DIARY_VERSION &&
    typeof value.exported_at === "string" &&
    isRecord(value.settings) &&
    Array.isArray(value.vocabulary) &&
    Array.isArray(value.timeline) &&
    value.timeline.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.id === "string" &&
        typeof entry.type === "string" &&
        typeof entry.timestamp === "string",
    )
  );
}
