import type { ReactNode } from "react";
import { Icon } from "./Icon.js";
import "./List.css";

export function ListGroup({
  id,
  title,
  action,
  footer,
  children,
}: {
  id?: string;
  title?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="list-group">
      {title && (
        <div className="list-group-head">
          <h3 className="list-group-title">{title}</h3>
          {action}
        </div>
      )}
      <div className="list-group-rows">{children}</div>
      {footer && <div className="list-group-footer">{footer}</div>}
    </section>
  );
}

interface ListRowProps {
  label: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  tone?: "default" | "accent";
}

function RowContent({ label, detail, value }: ListRowProps) {
  return (
    <>
      <span className="list-row-text">
        <span className="list-row-label">{label}</span>
        {detail && <span className="list-row-detail">{detail}</span>}
      </span>
      {value !== undefined && <span className="list-row-value">{value}</span>}
    </>
  );
}

export function ListRow(props: ListRowProps & { children?: ReactNode }) {
  return (
    <div className="list-row">
      <RowContent {...props} />
      {props.children}
    </div>
  );
}

export function ListButton({
  onClick,
  tone = "default",
  ...props
}: ListRowProps & { onClick: () => void }) {
  return (
    <button
      type="button"
      className={`list-row list-row-button list-row-${tone}`}
      onClick={onClick}
    >
      <RowContent {...props} />
      {tone === "default" && <Icon name="chevron" />}
    </button>
  );
}
