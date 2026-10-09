import type { CalculatedItem, CalculationResult } from "@pincho/shared";
import { Link } from "react-router";
import { type Language, t } from "../i18n.js";
import "./MealBreakdown.css";

export type MealResult = Omit<CalculationResult, "recommended_dose"> & {
  recommended_dose?: number;
};

const LOW_GI_MAX = 55;
const HIGH_GI_MIN = 70;

function giBand(gi: number): "low" | "medium" | "high" {
  if (gi <= LOW_GI_MAX) return "low";
  if (gi < HIGH_GI_MIN) return "medium";
  return "high";
}

function sourceOf(item: CalculatedItem): { label: string; url: string | null } {
  if (!item.food_item) {
    return { label: item.estimated ? "LLM" : "?", url: null };
  }
  const { data_type, fdc_id } = item.food_item;
  if (data_type === "curated") {
    return { label: "BEDCA", url: "https://www.bedca.net/bdpub/index.php" };
  }
  return {
    label: "USDA",
    url: `https://fdc.nal.usda.gov/food-details/${fdc_id}/nutrients`,
  };
}

export function totalDose(result: MealResult): number | undefined {
  return (
    result.fat_protein_adjustment?.total_dose ??
    result.correction?.total_dose ??
    result.recommended_dose
  );
}

function FoodRow({ item, lang }: { item: CalculatedItem; lang: Language }) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const source = sourceOf(item);
  const gi = item.glycemic_index;

  return (
    <li className="food" data-warning={item.warning ? "" : undefined}>
      <div className="food-name">
        {item.description}
        {gi != null && (
          <span
            className={`gi-badge gi-badge-${giBand(gi)}${item.gi_estimated ? " gi-badge-estimated" : ""}`}
            title={
              item.gi_estimated
                ? t(lang, "giEstimated")
                : (item.food_item?.gi_source ?? undefined)
            }
          >
            IG {item.gi_estimated ? "~" : ""}
            {gi}
          </span>
        )}
        {source.url ? (
          <a
            className="source-link"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.label}
          </a>
        ) : (
          <span
            className={`source-link${source.label === "?" ? " source-unknown" : ""}`}
          >
            {source.label}
          </span>
        )}
        {item.estimated && (
          <span className="estimated-badge">{t(lang, "estimated")}</span>
        )}
      </div>
      <div className="food-detail">
        {decimal.format(item.weight_g)} g ·{" "}
        {decimal.format(item.net_carbs_per_100g)} g/100 g
      </div>
      {item.notes && <div className="food-note">{item.notes}</div>}
      {item.warning && <div className="food-warning">{item.warning}</div>}
      <div className="food-carbs">
        <b>{decimal.format(item.net_carbs_g)} g</b>
        <small>{t(lang, "carbsShort")}</small>
      </div>
    </li>
  );
}

export function DoseCard({
  result,
  lang,
  penIncrement,
}: {
  result: MealResult;
  lang: Language;
  penIncrement: number;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  const total = totalDose(result);
  const signed = (units: number) =>
    `${units >= 0 ? "+" : "−"}${decimal.format(Math.abs(units))} U`;
  const correction = result.correction;
  const fatProtein = result.fat_protein_adjustment;

  return (
    <div className="dose">
      <div className="dose-caption">
        {t(lang, "suggestedDose")
          .replace("{window}", result.meal_window.name)
          .replace("{pen}", decimal.format(penIncrement))}
      </div>
      <div className="dose-total">
        <b>{total === undefined ? "—" : decimal.format(total)}</b>
        <span>U</span>
      </div>
      <dl className="dose-parts">
        <div>
          <dt>{t(lang, "mealPart")}</dt>
          <dd>
            {result.recommended_dose === undefined
              ? "—"
              : `${decimal.format(result.recommended_dose)} U`}
          </dd>
        </div>
        <div>
          <dt>{t(lang, "correction")}</dt>
          <dd>{correction ? signed(correction.correction_dose) : "—"}</dd>
        </div>
        <div>
          <dt>{t(lang, "fatProteinPart")}</dt>
          <dd>{fatProtein ? signed(fatProtein.adjustment_dose) : "—"}</dd>
        </div>
      </dl>
      <Link to="/fat-protein-info" className="dose-why">
        {t(lang, "fatProteinLearnMore")}
      </Link>
    </div>
  );
}

export function MealBreakdown({
  result,
  lang,
  penIncrement,
}: {
  result: MealResult;
  lang: Language;
  penIncrement: number;
}) {
  const decimal = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });
  return (
    <section className="breakdown">
      <h3 className="breakdown-title">{t(lang, "breakdown")}</h3>
      <ul className="foods">
        {result.items.map((item, i) => (
          <FoodRow key={`${item.description}-${i}`} item={item} lang={lang} />
        ))}
      </ul>
      <div className="breakdown-total">
        <span>{t(lang, "netCarbsTotal")}</span>
        <span>{decimal.format(result.total_net_carbs_g)} g</span>
      </div>
      <DoseCard result={result} lang={lang} penIncrement={penIncrement} />
    </section>
  );
}
