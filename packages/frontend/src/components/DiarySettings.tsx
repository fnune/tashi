import {
  type Diary,
  type DiaryReading,
  exportDiary,
  importDiary,
  readDiary,
} from "@tashi/shared";
import { useRef, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { Button } from "./ui/Button.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Notice } from "./ui/Notice.js";
import { Sheet } from "./ui/Sheet.js";
import "./DiarySettings.css";

type ImportStep =
  | { kind: "chosen"; diary: Diary; fileName: string }
  | { kind: "importing"; done: number; total: number }
  | { kind: "imported" }
  | { kind: "stopped"; message: string };

const READING_PROBLEMS = {
  not_json: "diaryNotADiary",
  not_a_diary: "diaryNotADiary",
  newer_version: "diaryNewerVersion",
} as const satisfies Record<
  Extract<DiaryReading, { ok: false }>["problem"],
  string
>;

export function DiarySettings({
  id,
  lang,
  onReplaced,
}: {
  id: string;
  lang: Language;
  onReplaced: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState<ImportStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setExporting(true);
    setError(null);
    try {
      const diary = await exportDiary(api.diaryApi, new Date());
      saveFile(
        `tashi-${diary.exported_at.slice(0, 10)}.json`,
        JSON.stringify(diary, null, 2),
      );
    } catch (err) {
      setError(apiErrorText(lang, err));
    } finally {
      setExporting(false);
    }
  }

  async function choose(file: File) {
    setError(null);
    const reading = readDiary(await file.text());
    if (!reading.ok) {
      setError(t(lang, READING_PROBLEMS[reading.problem]));
      return;
    }
    setStep({ kind: "chosen", diary: reading.diary, fileName: file.name });
  }

  async function replace(diary: Diary) {
    const total = diary.timeline.length;
    setStep({ kind: "importing", done: 0, total });
    try {
      await importDiary(api.diaryApi, diary, (done) =>
        setStep({ kind: "importing", done, total }),
      );
      setStep({ kind: "imported" });
    } catch (err) {
      setStep({
        kind: "stopped",
        message: `${t(lang, "diaryImportStopped")} ${apiErrorText(lang, err)}`,
      });
    }
    try {
      await onReplaced();
    } catch (err) {
      setStep({ kind: "stopped", message: apiErrorText(lang, err) });
    }
  }

  return (
    <div id={id} className="diary-settings">
      <ListGroup title={t(lang, "diaryTitle")}>
        <ListButton
          label={t(lang, "diaryExport")}
          detail={
            exporting ? t(lang, "diaryExporting") : t(lang, "diaryExportDetail")
          }
          value=""
          onClick={() => void download()}
        />
        <ListButton
          label={t(lang, "diaryImport")}
          detail={t(lang, "diaryImportDetail")}
          value=""
          onClick={() => fileInput.current?.click()}
        />
      </ListGroup>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label={t(lang, "diaryImport")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void choose(file);
        }}
      />
      {error && <Notice tone="danger">{error}</Notice>}

      <Sheet
        open={step !== null}
        title={t(lang, "diaryImport")}
        closeLabel={t(lang, "close")}
        onClose={() => {
          if (step?.kind !== "importing") setStep(null);
        }}
      >
        {step && (
          <ImportSheet
            step={step}
            lang={lang}
            onReplace={(diary) => void replace(diary)}
            onDone={() => setStep(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function ImportSheet({
  step,
  lang,
  onReplace,
  onDone,
}: {
  step: ImportStep;
  lang: Language;
  onReplace: (diary: Diary) => void;
  onDone: () => void;
}) {
  switch (step.kind) {
    case "chosen":
      return (
        <div className="diary-import">
          <Notice tone="warn">{t(lang, "diaryImportWarning")}</Notice>
          <ListGroup>
            <ListRow label={t(lang, "diaryFile")} value={step.fileName} />
            <ListRow
              label={t(lang, "diaryEntries")}
              value={String(step.diary.timeline.length)}
            />
            <ListRow
              label={t(lang, "diaryDates")}
              value={dateRange(step.diary, lang)}
            />
          </ListGroup>
          <div className="diary-import-buttons">
            <Button variant="secondary" onClick={onDone}>
              {t(lang, "cancel")}
            </Button>
            <Button variant="destructive" onClick={() => onReplace(step.diary)}>
              {t(lang, "diaryReplace")}
            </Button>
          </div>
        </div>
      );
    case "importing":
      return (
        <div className="diary-import" aria-live="polite">
          <p>
            {t(lang, "diaryImporting")} {step.done} / {step.total}
          </p>
          <progress value={step.done} max={Math.max(step.total, 1)} />
        </div>
      );
    case "imported":
      return (
        <div className="diary-import">
          <Notice tone="ok">{t(lang, "diaryImported")}</Notice>
          <Button onClick={onDone}>{t(lang, "close")}</Button>
        </div>
      );
    case "stopped":
      return (
        <div className="diary-import">
          <Notice tone="danger">{step.message}</Notice>
          <Button onClick={onDone}>{t(lang, "close")}</Button>
        </div>
      );
  }
}

function dateRange(diary: Diary, lang: Language): string {
  const times = diary.timeline.map((entry) => entry.timestamp).sort();
  const first = times[0];
  const last = times.at(-1);
  if (!first || !last) return "–";
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString(lang, { dateStyle: "medium" });
  return `${format(first)} – ${format(last)}`;
}

function saveFile(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
