import type { Settings, TimelineEntry } from "@pincho/shared";
import { DEFAULT_SETTINGS } from "@pincho/shared";
import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import * as api from "./api.js";
import { CalculatorView } from "./components/CalculatorView.js";
import { SettingsView } from "./components/SettingsView.js";
import { TimelineView } from "./components/TimelineView.js";
import type { Language } from "./i18n.js";
import { t } from "./i18n.js";

function getSavedLanguage(): Language {
  const saved = localStorage.getItem("pincho-lang");
  if (saved === "es" || saved === "en") return saved;
  return DEFAULT_SETTINGS.language;
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    language: getSavedLanguage(),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [prefill, setPrefill] = useState<string | undefined>();

  const lang = settings.language;

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      localStorage.setItem("pincho-lang", s.language);
      setSettingsLoaded(true);
    });
    api.getTimeline().then(setTimeline);
  }, []);

  const refreshTimeline = useCallback(() => {
    api.getTimeline().then(setTimeline);
  }, []);

  function handleSaveSettings(s: Settings) {
    setSettings(s);
    localStorage.setItem("pincho-lang", s.language);
  }

  function handleReuse(text: string) {
    setPrefill(text);
    navigate("/");
  }

  const currentPath = location.pathname;

  function navClass(path: string) {
    if (path === "/" && currentPath === "/") return "nav-btn active";
    if (path !== "/" && currentPath.startsWith(path)) return "nav-btn active";
    return "nav-btn";
  }

  if (!settingsLoaded) return null;

  return (
    <div className="app">
      <header className="header">
        <h1>
          <Link to="/" className="app-title">
            {t(lang, "appTitle")}
          </Link>
        </h1>
        <nav>
          <Link to="/" className={navClass("/")}>
            {t(lang, "calculate")}
          </Link>
          <Link
            to="/timeline"
            className={navClass("/timeline")}
            onClick={refreshTimeline}
          >
            {t(lang, "timeline")}
          </Link>
          <Link to="/settings" className={navClass("/settings")}>
            {t(lang, "settings")}
          </Link>
        </nav>
      </header>

      <Routes>
        <Route
          path="/"
          element={
            <CalculatorView
              settings={settings}
              lang={lang}
              onNewResult={refreshTimeline}
              prefill={prefill}
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
              onRefresh={refreshTimeline}
              onReuse={handleReuse}
            />
          }
        />
        <Route
          path="/history/*"
          element={<Navigate to="/timeline" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function TimelineRoute({
  timeline,
  lang,
  settings,
  onRefresh,
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
