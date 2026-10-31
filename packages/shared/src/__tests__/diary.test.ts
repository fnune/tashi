import { describe, expect, it } from "vitest";
import {
  type DiaryApi,
  exportDiary,
  importDiary,
  readDiary,
} from "../diary.js";
import {
  DEFAULT_SETTINGS,
  DIARY_FORMAT,
  DIARY_VERSION,
  type Diary,
  IMPORT_ENTRIES_PER_REQUEST,
  type ImportEntriesRequest,
  type StartImportRequest,
  type TimelineEntry,
} from "../types.js";

const glucose = (n: number): TimelineEntry => ({
  id: `g${n}`,
  timestamp: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(),
  time_zone: "Europe/Berlin",
  type: "glucose_reading",
  value: 100 + n,
  unit: "mg/dL",
});

const meal = (n: number): TimelineEntry => ({
  id: `m${n}`,
  timestamp: new Date(Date.UTC(2026, 5, 1, 0, n)).toISOString(),
  time_zone: "Europe/Berlin",
  type: "meal",
  input_text: "rice",
  language: "en",
  meal_window: { name: "lunch", start_hour: 11, end_hour: 16, ratio: 10 },
  items: [],
  total_net_carbs_g: 0,
  recommended_dose: 0,
  total_dose: 0,
});

function recordingApi(timeline: TimelineEntry[], pageSize = 2) {
  const started: StartImportRequest[] = [];
  const chunks: ImportEntriesRequest[] = [];
  const api: DiaryApi = {
    settings: async () => DEFAULT_SETTINGS,
    vocabulary: async () => [],
    timelinePage: async (cursor) => {
      const start = cursor === null ? 0 : Number(cursor);
      const end = start + pageSize;
      return {
        entries: timeline.slice(start, end),
        next: end < timeline.length ? String(end) : null,
      };
    },
    startImport: async (request) => {
      started.push(request);
    },
    importEntries: async (request) => {
      chunks.push(request);
    },
  };
  return { api, started, chunks };
}

const diaryOf = (timeline: TimelineEntry[]): Diary => ({
  format: DIARY_FORMAT,
  version: DIARY_VERSION,
  exported_at: "2026-06-02T00:00:00.000Z",
  settings: DEFAULT_SETTINGS,
  vocabulary: [],
  timeline,
});

describe("exporting the diary", () => {
  it("reads every page of the timeline into one file", async () => {
    const timeline = [
      glucose(1),
      glucose(2),
      glucose(3),
      glucose(4),
      glucose(5),
    ];
    const { api } = recordingApi(timeline);
    const diary = await exportDiary(api, new Date("2026-06-02T00:00:00Z"));
    expect(diary).toEqual(diaryOf(timeline));
  });
});

describe("importing the diary", () => {
  it("sends meals before the doses that may point at them", async () => {
    const { api, chunks } = recordingApi([]);
    await importDiary(api, diaryOf([glucose(1), meal(2), glucose(3), meal(4)]));
    expect(chunks.flatMap((chunk) => chunk.entries.map((e) => e.id))).toEqual([
      "m2",
      "m4",
      "g1",
      "g3",
    ]);
  });

  it("starts with the settings and vocabulary, then sends entries in small requests", async () => {
    const timeline = Array.from(
      { length: IMPORT_ENTRIES_PER_REQUEST * 2 + 1 },
      (_, i) => glucose(i),
    );
    const { api, started, chunks } = recordingApi([]);
    const progress: number[] = [];
    await importDiary(api, diaryOf(timeline), (done) => progress.push(done));
    expect(started).toEqual([{ settings: DEFAULT_SETTINGS, vocabulary: [] }]);
    expect(chunks.map((chunk) => chunk.entries.length)).toEqual([
      IMPORT_ENTRIES_PER_REQUEST,
      IMPORT_ENTRIES_PER_REQUEST,
      1,
    ]);
    expect(progress.at(-1)).toBe(timeline.length);
  });
});

describe("reading a diary file", () => {
  it("reads a file it wrote", () => {
    const diary = diaryOf([glucose(1)]);
    expect(readDiary(JSON.stringify(diary))).toEqual({ ok: true, diary });
  });

  it("says why it cannot read a file", () => {
    expect(readDiary("not json")).toEqual({ ok: false, problem: "not_json" });
    expect(readDiary(JSON.stringify({ hello: 1 }))).toEqual({
      ok: false,
      problem: "not_a_diary",
    });
    expect(
      readDiary(JSON.stringify({ ...diaryOf([]), version: DIARY_VERSION + 1 })),
    ).toEqual({ ok: false, problem: "newer_version" });
    expect(
      readDiary(JSON.stringify({ ...diaryOf([]), timeline: [{ id: 1 }] })),
    ).toEqual({ ok: false, problem: "not_a_diary" });
  });
});
