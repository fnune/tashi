import type { ReactNode } from "react";
import { Link } from "react-router";
import "./Notice.css";

export function Notice({
  tone,
  children,
  action,
}: {
  tone: "danger" | "warn" | "info" | "ok";
  children: ReactNode;
  action?: { label: string; to: string };
}) {
  return (
    <div
      className="notice"
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <span>{children}</span>
      {action && (
        <Link to={action.to} className="notice-action">
          {action.label}
        </Link>
      )}
    </div>
  );
}
