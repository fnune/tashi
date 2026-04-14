import type { CalculationResult, Settings } from "@pincho/shared";
import { DEFAULT_SETTINGS } from "@pincho/shared";
import { useCallback, useEffect, useState } from "react";
import * as api from "./api.js";
import { CalculatorView } from "./components/CalculatorView.js";
import { HistoryView } from "./components/HistoryView.js";
import { SettingsView } from "./components/SettingsView.js";
import { t } from "./i18n.js";

type View = "calculator" | "settings" | "history";

export function App() {
  const [view, setView] = useState<View>("calculator");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<CalculationResult[]>([]);
  const [prefill, setPrefill] = useState<string | undefined>();

  const lang = settings.language;

  useEffect(() => {
    api.getSettings().then(setSettings);
    api.getHistory().then(setHistory);
  }, []);

  const refreshHistory = useCallback(() => {
    api.getHistory().then(setHistory);
  }, []);

  function handleReuse(text: string) {
    setPrefill(text);
    setView("calculator");
  }

  return (
    <div className="app">
      <header className="header">
        <h1>{t(lang, "appTitle")}</h1>
        <nav>
          <button
            type="button"
            className={`nav-btn ${view === "calculator" ? "active" : ""}`}
            onClick={() => setView("calculator")}
          >
            {t(lang, "calculate")}
          </button>
          <button
            type="button"
            className={`nav-btn ${view === "history" ? "active" : ""}`}
            onClick={() => {
              refreshHistory();
              setView("history");
            }}
          >
            {t(lang, "history")}
          </button>
          <button
            type="button"
            className={`nav-btn ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            {t(lang, "settings")}
          </button>
        </nav>
      </header>

      {view === "calculator" && (
        <CalculatorView
          settings={settings}
          lang={lang}
          onNewResult={refreshHistory}
          prefill={prefill}
        />
      )}

      {view === "settings" && (
        <SettingsView settings={settings} onSave={setSettings} lang={lang} />
      )}

      {view === "history" && (
        <HistoryView
          history={history}
          lang={lang}
          onRefresh={refreshHistory}
          onReuse={handleReuse}
        />
      )}

      <div className="disclaimer">
        {lang === "es"
          ? "Esta herramienta no sustituye el consejo medico. Verifica siempre con tu equipo de salud."
          : "This tool does not replace medical advice. Always verify with your care team."}
      </div>
    </div>
  );
}
