import type { GlucoseUnit } from "@tashi/shared";
import { GLUCOSE_ENTRY_LIMITS, isPlausibleGlucose } from "@tashi/shared";
import { parseDecimal } from "./components/ui/Field.js";
import type { Language } from "./i18n.js";
import { t } from "./i18n.js";

export function parseGlucoseInput(
  text: string,
  unit: GlucoseUnit,
  lang: Language,
): { value: number | null; error: string | null } {
  if (text.trim() === "") return { value: null, error: null };
  const value = parseDecimal(text);
  if (value !== null && isPlausibleGlucose(value, unit)) {
    return { value, error: null };
  }
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const { min, max } = GLUCOSE_ENTRY_LIMITS[unit];
  return {
    value: null,
    error: t(lang, "glucoseOutOfRange")
      .replace("{min}", decimal.format(min))
      .replace("{max}", decimal.format(max))
      .replace("{unit}", unit),
  };
}
