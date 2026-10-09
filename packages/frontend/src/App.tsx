import type { InsulinOnBoard, Settings, TimelineEntry } from "@pincho/shared";
import { DEFAULT_SETTINGS } from "@pincho/shared";
import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router";
import * as api from "./api.js";
import { AppHeader } from "./components/AppHeader.js";
import {
  type CalculatorFormState,
  CalculatorView,
} from "./components/CalculatorView.js";
import { FatProteinInfoView } from "./components/FatProteinInfoView.js";
import { SettingsView } from "./components/SettingsView.js";
import { TabBar } from "./components/TabBar.js";
import { TimelineView } from "./components/TimelineView.js";
import type { Language } from "./i18n.js";

const INITIAL_FORM: CalculatorFormState = {
  foodText: "",
  bloodSugar: "",
  preBolus: "",
};

const IOB_REFRESH_INTERVAL_MS = 30_000;

function getSavedLanguage(): Language {
  const saved = localStorage.getItem("pincho-lang");
  if (saved === "es" || saved === "en") return saved;
  return DEFAULT_SETTINGS.language;
}

function AppShell() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    language: getSavedLanguage(),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [iob, setIob] = useState<InsulinOnBoard | null>(null);
  const [calcForm, setCalcForm] = useState<CalculatorFormState>(INITIAL_FORM);

  const lang = settings.language;

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        localStorage.setItem("pincho-lang", s.language);
        setSettingsLoaded(true);
      })
      .catch((e) => {
        setLoadError(
          e instanceof Error ? e.message : "Failed to load settings",
        );
      });
    api.getTimeline().then(setTimeline).catch(console.error);
    api
      .getIob()
      .then(setIob)
      .catch(() => setIob(null));
  }, []);

  const refreshTimeline = useCallback(() => {
    api.getTimeline().then(setTimeline).catch(console.error);
  }, []);

  const refreshIob = useCallback(() => {
    api
      .getIob()
      .then(setIob)
      .catch(() => setIob(null));
  }, []);

  const handleDataChanged = useCallback(() => {
    refreshTimeline();
    refreshIob();
  }, [refreshTimeline, refreshIob]);

  useEffect(() => {
    const id = setInterval(refreshIob, IOB_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshIob]);

  function handleSaveSettings(s: Settings) {
    setSettings(s);
    localStorage.setItem("pincho-lang", s.language);
  }

  function handleReuse(text: string) {
    setCalcForm({ ...INITIAL_FORM, foodText: text });
    navigate("/");
  }

  if (loadError) {
    return (
      <div className="app">
        <div className="error-box">{loadError}</div>
      </div>
    );
  }

  if (!settingsLoaded) return null;

  return (
    <div className="app">
      <AppHeader settings={settings} lang={lang} />

      <Routes>
        <Route
          path="/"
          element={
            <CalculatorView
              settings={settings}
              lang={lang}
              iob={iob}
              onNewResult={handleDataChanged}
              formState={calcForm}
              onFormChange={setCalcForm}
            />
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsView
              settings={settings}
              onSave={handleSaveSettings}
              lang={lang}
            />
          }
        />
        <Route
          path="/timeline/:id?"
          element={
            <TimelineRoute
              timeline={timeline}
              settings={settings}
              lang={lang}
              onRefresh={handleDataChanged}
              onReuse={handleReuse}
            />
          }
        />
        <Route
          path="/fat-protein-info"
          element={<FatProteinInfoView lang={lang} />}
        />
        <Route
          path="/history/*"
          element={<Navigate to="/timeline" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar
        lang={lang}
        onNavigate={(to) => {
          if (to === "/timeline") refreshTimeline();
        }}
      />
    </div>
  );
}

function TimelineRoute({
  timeline,
  lang,
  settings,
  onRefresh,
  onReuse,
}: {
  timeline: TimelineEntry[];
  lang: Language;
  settings: Settings;
  onRefresh: () => void;
  onReuse: (text: string) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  function handleExpand(expandedId: string | undefined) {
    navigate(expandedId ? `/timeline/${expandedId}` : "/timeline", {
      replace: true,
    });
  }

  return (
    <TimelineView
      timeline={timeline}
      settings={settings}
      lang={lang}
      onRefresh={onRefresh}
      expandedId={id}
      onExpand={handleExpand}
      onReuse={onReuse}
    />
  );
}

declare const __BASE_PATH__: string;

export function App() {
  return (
    <BrowserRouter basename={__BASE_PATH__ || "/"}>
      <AppShell />
    </BrowserRouter>
  );
}
