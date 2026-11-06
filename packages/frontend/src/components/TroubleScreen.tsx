import { type ReactNode, useEffect, useState } from "react";
import { NO_ANSWER_MS } from "../api.js";
import { type Language, t } from "../i18n.js";
import { Logo } from "./Logo.js";
import { ProblemReportSheet } from "./ProblemReportSheet.js";
import { Button } from "./ui/Button.js";
import "./TroubleScreen.css";

const reload = () => window.location.reload();

export function TroubleScreen({
  lang,
  title,
  children,
}: {
  lang: Language;
  title: string;
  children: ReactNode;
}) {
  const [reporting, setReporting] = useState(false);
  return (
    <main className="trouble">
      <Logo className="trouble-logo" />
      <h1>{title}</h1>
      {children}
      <div className="trouble-actions">
        <Button onClick={reload}>{t(lang, "reload")}</Button>
        <Button variant="secondary" onClick={() => setReporting(true)}>
          {t(lang, "reportProblem")}
        </Button>
      </div>
      <ProblemReportSheet
        open={reporting}
        lang={lang}
        onClose={() => setReporting(false)}
      />
    </main>
  );
}

export function WaitingForServer({ lang }: { lang: Language }) {
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitedTooLong(true), NO_ANSWER_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!waitedTooLong) return null;
  return (
    <TroubleScreen lang={lang} title={t(lang, "notAnsweringTitle")}>
      <p>{t(lang, "notAnsweringText")}</p>
    </TroubleScreen>
  );
}
