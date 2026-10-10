import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon, type IconName } from "./Icon.js";
import "./Notice.css";

type Tone = "danger" | "warn" | "info" | "ok";

const ICONS: Record<Tone, IconName> = {
  danger: "alert",
  warn: "alert",
  info: "info",
  ok: "check",
};

export function Notice({
  tone,
  children,
  action,
}: {
  tone: Tone;
  children: ReactNode;
  action?: { label: string; to: string };
}) {
  return (
    <div
      className="notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span className="notice-icon">
        <Icon name={ICONS[tone]} />
      </span>
      <span className="notice-text">{children}</span>
      {action && (
        <Link to={action.to} className="notice-action">
          {action.label}
        </Link>
      )}
    </div>
  );
}
