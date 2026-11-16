import type { InsulinOnBoard, Settings, TimelineEntry } from "@tashi/shared";
import { DEFAULT_SETTINGS } from "@tashi/shared";
import { useCallback, useEffect, useState } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";
import * as api from "./api.js";
import { AppHeader } from "./components/AppHeader.js";
import { AuthGate } from "./components/AuthGate.js";
import {
  type CalculatorFormState,
  CalculatorView,
} from "./components/CalculatorView.js";
import { CrashBoundary } from "./components/CrashBoundary.js";
import { SettingsView } from "./components/SettingsView.js";
import { TabBar } from "./components/TabBar.js";
import { TimelineView } from "./components/TimelineView.js";
import { TroubleScreen, WaitingForServer } from "./components/TroubleScreen.js";
import { UnitsExplainerView } from "./components/UnitsExplainerView.js";
import { Notice } from "./components/ui/Notice.js";
import { type Language, savedLanguage, t } from "./i18n.js";
import { type PagedListHandle, usePagedList } from "./paging/use-paged-list.js";
import {
  type KeyValueStore,
  restorePendingCalculation,
  savePendingCalculation,
} from "./pending-calculation.js";

const INITIAL_FORM: CalculatorFormState = {
  foodText: "",
  preBolusMinutes: 0,
  result: null,
  units: 0,
  calculatedAt: null,
  injectedAt: null,
};

function deviceStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const IOB_REFRESH_INTERVAL_MS = 30_000;

function AppShell() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<Settings>({
    ...DEFAULT_SETTINGS,
    language: savedLanguage(),
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const timeline = usePagedList(api.getTimelinePage, (entry) => entry.id);
  const [iob, setIob] = useState<InsulinOnBoard | null>(null);
  const [calcForm, setCalcForm] = useState<CalculatorFormState>(() => {
    const store = deviceStore();
    return (
      (store && restorePendingCalculation(store, new Date())) ?? INITIAL_FORM
    );
  });

  useEffect(() => {
    const store = deviceStore();
    if (!store) return;
    try {
      savePendingCalculation(store, calcForm);
    } catch (error) {
      console.warn("Could not keep the calculation on this device", error);
    }
  }, [calcForm]);

  const lang = settings.language;

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s);
        localStorage.setItem("tashi-lang", s.language);
        setSettingsLoaded(true);
      })
      .catch((e) => {
        setLoadError(
          e instanceof Error ? e.message : "Failed to load settings",
        );
      });
    api
      .getIob()
      .then(setIob)
      .catch(() => setIob(null));
  }, []);

  const { list: timelineList } = timeline;
  const refreshTimeline = useCallback(() => {
    void timelineList.reload();
  }, [timelineList]);

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
    localStorage.setItem("tashi-lang", s.language);
  }

  async function handleDiaryReplaced() {
    handleDataChanged();
    handleSaveSettings(await api.getSettings());
  }

  function handleReuse(text: string) {
    setCalcForm({ ...INITIAL_FORM, foodText: text });
    navigate("/");
  }

  if (loadError) {
    return (
      <TroubleScreen lang={lang} title={t(lang, "unreachableTitle")}>
        <Notice tone="danger">{loadError}</Notice>
      </TroubleScreen>
    );
  }

  if (!settingsLoaded) return <WaitingForServer lang={lang} />;

  return (
    <div className="app">
      <AppHeader settings={settings} lang={lang} />

      <Routes>
        <Route
          path="/"
          element={
            <CalculatorView
              settings={settings}
              onSettingsSaved={handleSaveSettings}
              lang={lang}
              iob={iob}
              timeline={timeline.items}
              onDataChanged={handleDataChanged}
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
              onDiaryReplaced={handleDiaryReplaced}
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
          path="/units-explained"
          element={
            <UnitsExplainerView
              lang={lang}
              ratioFormat={settings.ratio_format}
            />
          }
        />
        <Route path="/dose-explained" element={<ToUnitsExplained />} />
        <Route
          path="/fat-protein-info"
          element={<Navigate to="/units-explained#fat-protein" replace />}
        />
        <Route
          path="/history/*"
          element={<Navigate to="/timeline" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar
        lang={lang}
        pendingUnits={calcForm.result !== null}
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
  timeline: PagedListHandle<TimelineEntry>;
  lang: Language;
  settings: Settings;
  onRefresh: () => void;
  onReuse: (text: string) => void;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { list } = timeline;
  const loadMore = useCallback(() => void list.loadMore(), [list]);
  const loadUntil = useCallback(
    (found: (entries: TimelineEntry[]) => boolean) => list.loadUntil(found),
    [list],
  );

  function handleExpand(expandedId: string | undefined) {
    navigate(expandedId ? `/timeline/${expandedId}` : "/timeline", {
      replace: true,
    });
  }

  return (
    <TimelineView
      timeline={timeline.items}
      paging={{
        hasMore: timeline.hasMore,
        loading: timeline.loading,
        loaded: timeline.loaded,
        error: timeline.error,
        loadMore,
        loadUntil,
      }}
      settings={settings}
      lang={lang}
      onRefresh={onRefresh}
      expandedId={id}
      onExpand={handleExpand}
      onReuse={onReuse}
    />
  );
}

function ToUnitsExplained() {
  const { hash } = useLocation();
  return <Navigate to={`/units-explained${hash}`} replace />;
}

export function App() {
  return (
    <CrashBoundary>
      <BrowserRouter basename={api.BASE_PATH || "/"}>
        <AuthGate>
          <AppShell />
        </AuthGate>
      </BrowserRouter>
    </CrashBoundary>
  );
}
