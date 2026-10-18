import type { RatioFormat, WindowRatio } from "@tashi/shared";
import { type Language, t } from "../i18n.js";
import { signedPercent } from "../profileLabels.js";
import { formatRatio } from "../ratioLabels.js";
import "./RatioValue.css";

export function RatioValue({
  ratio,
  format,
  lang,
}: {
  ratio: WindowRatio;
  format: RatioFormat;
  lang: Language;
}) {
  const result = formatRatio(ratio.result, format, lang);
  if (ratio.modifier.kind === "none") return <>{result}</>;

  const base = formatRatio(ratio.base, format, lang);
  return (
    <span className="ratio-value" data-modifier={ratio.modifier.kind}>
      <b>{result}</b>
      <small>
        {ratio.modifier.kind === "own" ? <s>{base}</s> : base}
        {" · "}
        {ratio.modifier.kind === "percent"
          ? signedPercent(ratio.modifier.percent)
          : t(lang, "fromProfile")}
      </small>
    </span>
  );
}
