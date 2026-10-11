import type { Language } from "./i18n.js";

const MISSING = "—";

export function numberFormat(
  lang: Language,
  options: Intl.NumberFormatOptions = { maximumFractionDigits: 1 },
): { format: (value: number) => string } {
  const formatter = new Intl.NumberFormat(lang, options);
  return {
    format: (value) =>
      Number.isFinite(value) ? formatter.format(value) : MISSING,
  };
}
