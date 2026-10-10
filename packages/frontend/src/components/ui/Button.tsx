import type { ButtonHTMLAttributes } from "react";
import "./Button.css";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "text" | "danger" | "destructive";
}) {
  return (
    <button
      type="button"
      className={`button button-${variant}${className ? ` ${className}` : ""}`}
      {...props}
    />
  );
}
