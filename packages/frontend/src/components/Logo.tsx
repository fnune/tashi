import markDark from "../assets/tashi-mark-dark.svg";
import markLight from "../assets/tashi-mark-light.svg";
import "./Logo.css";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`logo ${className ?? ""}`}>
      <img className="logo-light" src={markLight} alt="" />
      <img className="logo-dark" src={markDark} alt="" />
    </span>
  );
}
