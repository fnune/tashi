import { Component, type ReactNode } from "react";
import { clientProblems } from "../client-problems.js";
import { savedLanguage, t } from "../i18n.js";
import { TroubleScreen } from "./TroubleScreen.js";

export class CrashBoundary extends Component<
  { children: ReactNode },
  { crashed: boolean }
> {
  override state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  override componentDidCatch(error: Error) {
    clientProblems.record({
      at: new Date(),
      kind: "crash",
      method: null,
      path: window.location.pathname,
      detail: `${error.name}: ${error.message}`,
    });
  }

  override render() {
    if (!this.state.crashed) return this.props.children;
    const lang = savedLanguage();
    return (
      <TroubleScreen lang={lang} title={t(lang, "crashTitle")}>
        <p>{t(lang, "crashText")}</p>
      </TroubleScreen>
    );
  }
}
