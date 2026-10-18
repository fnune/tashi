import type { RatioFormat } from "@tashi/shared";
import { fromDisplayRatio, toDisplayRatio } from "@tashi/shared";
import { parseDecimal } from "./components/ui/Field.js";
import type { Language } from "./i18n.js";
import { t } from "./i18n.js";

export function ratioUnit(format: RatioFormat, lang: Language): string {
  return t(
    lang,
    format === "units_per_10g"
      ? "ratioUnitPerTenGrams"
      : "ratioUnitGramsPerUnit",
  );
}

export function ratioHint(format: RatioFormat, lang: Language): string {
  return t(
    lang,
    format === "units_per_10g" ? "ratioHintPerTenGrams" : "ratioUnitHint",
  );
}

function decimals(lang: Language) {
  return new Intl.NumberFormat(lang, {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

export function formatRatio(
  gramsPerUnit: number,
  format: RatioFormat,
  lang: Language,
): string {
  return `${decimals(lang).format(toDisplayRatio(gramsPerUnit, format))}\u00a0${ratioUnit(format, lang)}`;
}

export function formatRatioNumber(
  gramsPerUnit: number,
  format: RatioFormat,
  lang: Language,
): string {
  return decimals(lang).format(toDisplayRatio(gramsPerUnit, format));
}

export function ratioInputText(
  gramsPerUnit: number,
  format: RatioFormat,
  lang: Language,
): string {
  return decimals(lang).format(toDisplayRatio(gramsPerUnit, format));
}

// The input shows a rounded conversion; parsing that back would nudge the
// stored ratio, so an untouched field keeps the original value.
export function parseRatioInput(
  text: string,
  format: RatioFormat,
  lang: Language,
  original?: number,
): number | null {
  if (
    original !== undefined &&
    text === ratioInputText(original, format, lang)
  ) {
    return original;
  }
  const value = parseDecimal(text);
  return value !== null && value > 0 ? fromDisplayRatio(value, format) : null;
}
