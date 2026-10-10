import { NavLink } from "react-router";
import type { Language } from "../i18n.js";
import { t } from "../i18n.js";
import { Icon, type IconName } from "./ui/Icon.js";
import "./TabBar.css";

const TABS: {
  to: string;
  icon: IconName;
  label: "calculate" | "timeline" | "settings";
}[] = [
  { to: "/", icon: "calculate", label: "calculate" },
  { to: "/timeline", icon: "history", label: "timeline" },
  { to: "/settings", icon: "settings", label: "settings" },
];

export function TabBar({
  lang,
  onNavigate,
}: {
  lang: Language;
  onNavigate: (to: string) => void;
}) {
  return (
    <div className="tab-bar">
      <nav aria-label={t(lang, "mainNavigation")}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/"}
            className="tab-bar-item"
            onClick={() => onNavigate(tab.to)}
          >
            <Icon name={tab.icon} size="lg" />
            {t(lang, tab.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
