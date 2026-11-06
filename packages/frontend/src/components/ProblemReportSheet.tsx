import { useEffect, useState } from "react";
import * as api from "../api.js";
import { clientProblems } from "../client-problems.js";
import { type Language, t } from "../i18n.js";
import {
  issueUrl,
  problemReport,
  type ReportInput,
  type ServerProblems,
} from "../problem-report.js";
import { Button } from "./ui/Button.js";
import { Notice } from "./ui/Notice.js";
import { Sheet } from "./ui/Sheet.js";
import "./ProblemReportSheet.css";

const SERVER_LIST_WAIT_MS = 8000;

type CopyState = "idle" | "copied" | "failed";

function serverListUnavailable(error: unknown): ServerProblems {
  const needsAdmin =
    error instanceof api.ApiError &&
    (error.code === "signed_out" || error.code === "not_found");
  return {
    kind: "unavailable",
    reason: needsAdmin
      ? "only an admin who is signed in can include it"
      : error instanceof Error
        ? error.message
        : String(error),
  };
}

export function ProblemReportSheet({
  open,
  lang,
  onClose,
}: {
  open: boolean;
  lang: Language;
  onClose: () => void;
}) {
  const [report, setReport] = useState<ReportInput | null>(null);
  const [copy, setCopy] = useState<CopyState>("idle");

  useEffect(() => {
    if (!open) return;
    let current = true;
    setReport(null);
    setCopy("idle");
    api
      .getProblems(AbortSignal.timeout(SERVER_LIST_WAIT_MS))
      .then(
        (response): ServerProblems => ({
          kind: "listed",
          problems: response.problems,
        }),
      )
      .catch(serverListUnavailable)
      .then((server) => {
        if (!current) return;
        setReport({
          commit: __TASHI_COMMIT__,
          userAgent: navigator.userAgent,
          reportedAt: new Date(),
          server,
          client: clientProblems.list(),
        });
      });
    return () => {
      current = false;
    };
  }, [open]);

  async function copyReport(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  const text = report ? problemReport(report).body : null;

  return (
    <Sheet
      open={open}
      title={t(lang, "reportProblem")}
      closeLabel={t(lang, "close")}
      onClose={onClose}
    >
      <div className="problem-report">
        <p>{t(lang, "reportIntro")}</p>
        {report === null || text === null ? (
          <p role="status">{t(lang, "reportGathering")}</p>
        ) : (
          <>
            {report.server.kind === "unavailable" && (
              <Notice tone="info">{t(lang, "reportServerAdminOnly")}</Notice>
            )}
            <pre className="problem-report-text">{text}</pre>
            <div className="problem-report-actions">
              <a
                className="button button-primary"
                href={issueUrl(report)}
                target="_blank"
                rel="noreferrer"
              >
                {t(lang, "reportOpen")}
              </a>
              <Button variant="secondary" onClick={() => void copyReport(text)}>
                {t(lang, "reportCopy")}
              </Button>
            </div>
            {copy === "copied" && (
              <Notice tone="ok">{t(lang, "reportCopied")}</Notice>
            )}
            {copy === "failed" && (
              <Notice tone="warn">{t(lang, "reportCopyFailed")}</Notice>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
