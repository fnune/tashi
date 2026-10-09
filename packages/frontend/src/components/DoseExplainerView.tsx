import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Language } from "../i18n.js";
import "./DoseExplainerView.css";

interface Reference {
  label: string;
  url?: string;
  note: string;
}

interface Content {
  back: string;
  title: string;
  lead: string;
  steps: { title: string; formula: string; detail: ReactNode }[];
  sections: { id: string; title: string; body: ReactNode }[];
  referencesTitle: string;
  references: Reference[];
}

const CYCLE_REVIEW = "https://pmc.ncbi.nlm.nih.gov/articles/PMC9962060/";

const CONTENT: Record<Language, Content> = {
  en: {
    back: "Back",
    title: "How your dose is worked out",
    lead: "Musa adds up three parts, applies your active profile and rounds once to your pen's increment.",
    steps: [
      {
        title: "Meal",
        formula: "net carbs ÷ ratio",
        detail:
          "The ratio comes from the meal window that covers the current time, or from your active profile if it sets its own ratio for that window.",
      },
      {
        title: "Correction",
        formula: "(glucose − target) ÷ correction factor − insulin on board",
        detail:
          "Only uses a manual reading from the last 30 minutes. Insulin on board can cancel a correction for high glucose but never cuts into the meal dose; below target the correction is negative and lowers the dose.",
      },
      {
        title: "Fat and protein",
        formula: "meal × extra %",
        detail: "Added only when the meal crosses one of the thresholds below.",
      },
      {
        title: "Profile",
        formula: "total × (1 + profile %)",
        detail:
          "A percentage profile scales the sum of the three parts, after correction and fat/protein. Nothing is rounded until this point.",
      },
      {
        title: "Rounding",
        formula: "nearest 0.5 U or 1 U",
        detail:
          "The total is rounded once to your pen increment. The parts on the dose card are shown unrounded to one decimal, so they may not add up exactly.",
      },
    ],
    sections: [
      {
        id: "fat-protein",
        title: "Fat and protein",
        body: (
          <>
            <p>
              High-fat and high-protein meals slow gastric emptying and
              stimulate hepatic glucose output. That causes a delayed rise,
              typically 3–5 hours after eating, when rapid insulin has already
              peaked. The classic example is pizza: carb-counted correctly yet
              still spiking late. Wolpert et al. (2013) found high-fat meals
              needed on average 42 % more insulin.
            </p>
            <p>The extra applies when any of these is met:</p>
            <ul>
              <li>Total fat above 30 g</li>
              <li>Fat above 15 g and protein above 25 g</li>
              <li>
                Fat and protein provide more than 80 % of the meal's energy
                (Atwater factors: fat 9 kcal/g, protein and carbs 4 kcal/g)
              </li>
            </ul>
            <p>
              The default +20 % is conservative: the ADA suggests starting
              there, and Bell et al. (2020) found +30 % best for high-fat meals.
              Below the thresholds plain carb counting is accurate enough;
              adding extra insulin to ordinary meals is the most common cause of
              hypoglycaemia in the literature. On pens the extra goes in the
              same single injection.
            </p>
          </>
        ),
      },
      {
        id: "profiles",
        title: "Profiles",
        body: (
          <>
            <p>
              A profile adapts your doses to a situation such as sport, a sick
              day or a phase of your cycle. You switch profiles by hand; they
              never expire or change on their own.
            </p>
            <ul>
              <li>
                <b>Percentage:</b> scales the final dose, so −20 % turns 5 U
                into 4 U. Ratios and the correction factor stay as they are.
              </li>
              <li>
                <b>By time of day:</b> replaces the ratio of each window you
                fill in; empty windows keep their usual ratio.
              </li>
            </ul>
            <p>
              The seeded profiles are examples. Agree the values that suit you
              with your care team. Every logged meal records the profile it
              used.
            </p>
          </>
        ),
      },
      {
        id: "cycle",
        title: "Menstrual cycle",
        body: (
          <>
            <p>
              Cycle tracking only informs: it never changes a dose. From the
              first day of your last period and your average cycle length it
              works out the day and phase, assuming a 5-day period and a 14-day
              luteal phase.
            </p>
            <p>
              Studies in type 1 diabetes point to lower insulin sensitivity in
              the luteal phase for some women, linked to progesterone, but the
              evidence is not conclusive and varies between people. That is why
              Musa only suggests switching profile on day 1 and on the first
              luteal day, and leaves the decision to you.
            </p>
          </>
        ),
      },
    ],
    referencesTitle: "References",
    references: [
      {
        label: "Bell KJ et al. (2020)",
        url: "https://doi.org/10.2337/dc19-0687",
        note: "+30 % ratio for high-fat meals; the amount of fat mattered, not its type.",
      },
      {
        label: "Wolpert HA et al. (2013)",
        url: "https://doi.org/10.2337/dc12-0092",
        note: "The pizza study: +42 % insulin on average, with wide individual variation.",
      },
      {
        label: "Smith TA et al. (2021)",
        url: "https://doi.org/10.1111/dme.14512",
        note: "A single upfront 125 % dose beat standard dosing for a high-fat, high-protein breakfast on pens.",
      },
      {
        label: "ADA Standards of Care in Diabetes (2024)",
        note: "Recommends +20 % as the starting point for fat and protein.",
      },
      {
        label: "Menstrual cycle and insulin sensitivity in T1D (2023)",
        url: CYCLE_REVIEW,
        note: "Systematic review: lower sensitivity in the luteal phase for some women; inconclusive overall.",
      },
    ],
  },
  es: {
    back: "Volver",
    title: "Cómo se calcula tu dosis",
    lead: "Musa suma tres partes, aplica tu perfil activo y redondea una sola vez al incremento de tu bolígrafo.",
    steps: [
      {
        title: "Comida",
        formula: "HC netos ÷ ratio",
        detail:
          "El ratio es el de la franja que cubre la hora actual, o el de tu perfil activo si define uno propio para esa franja.",
      },
      {
        title: "Corrección",
        formula:
          "(glucemia − objetivo) ÷ factor de corrección − insulina activa",
        detail:
          "Solo usa una medida manual de los últimos 30 minutos. La insulina activa puede anular una corrección por glucosa alta, pero nunca reduce la dosis de la comida; por debajo del objetivo la corrección es negativa y baja la dosis.",
      },
      {
        title: "Grasa y proteína",
        formula: "comida × % extra",
        detail:
          "Solo se añade cuando la comida supera alguno de los umbrales de abajo.",
      },
      {
        title: "Perfil",
        formula: "total × (1 + % del perfil)",
        detail:
          "Un perfil de porcentaje escala la suma de las tres partes, después de la corrección y la grasa/proteína. Hasta aquí no se redondea nada.",
      },
      {
        title: "Redondeo",
        formula: "0,5 U o 1 U más cercana",
        detail:
          "El total se redondea una vez al incremento de tu bolígrafo. Las partes de la tarjeta de dosis se muestran sin redondear, con un decimal, así que pueden no sumar exactamente.",
      },
    ],
    sections: [
      {
        id: "fat-protein",
        title: "Grasa y proteína",
        body: (
          <>
            <p>
              Las comidas con mucha grasa y proteína ralentizan el vaciado
              gástrico y estimulan la producción hepática de glucosa. Eso
              provoca una subida tardía, normalmente 3–5 horas después de comer,
              cuando la insulina rápida ya ha pasado su pico. El ejemplo clásico
              es la pizza: bien contada en hidratos y aun así con un pico
              tardío. Wolpert et al. (2013) vieron que estas comidas necesitaban
              de media un 42 % más de insulina.
            </p>
            <p>
              El extra se aplica cuando se cumple alguna de estas condiciones:
            </p>
            <ul>
              <li>Grasa total por encima de 30 g</li>
              <li>Grasa por encima de 15 g y proteína por encima de 25 g</li>
              <li>
                La grasa y la proteína aportan más del 80 % de la energía de la
                comida (factores Atwater: grasa 9 kcal/g, proteína e hidratos 4
                kcal/g)
              </li>
            </ul>
            <p>
              El +20 % por defecto es conservador: la ADA recomienda empezar
              ahí, y Bell et al. (2020) vieron que +30 % era lo mejor para
              comidas grasas. Por debajo de los umbrales basta con contar
              hidratos; añadir insulina extra a comidas normales es la causa más
              frecuente de hipoglucemia en la literatura. Con bolígrafo, el
              extra va en la misma inyección.
            </p>
          </>
        ),
      },
      {
        id: "profiles",
        title: "Perfiles",
        body: (
          <>
            <p>
              Un perfil adapta tus dosis a una situación como el deporte, un día
              de enfermedad o una fase del ciclo. Los perfiles se cambian a
              mano; nunca caducan ni cambian solos.
            </p>
            <ul>
              <li>
                <b>Porcentaje:</b> escala la dosis final, así que −20 %
                convierte 5 U en 4 U. Los ratios y el factor de corrección no
                cambian.
              </li>
              <li>
                <b>Por momento del día:</b> sustituye el ratio de cada franja
                que rellenes; las vacías mantienen su ratio habitual.
              </li>
            </ul>
            <p>
              Los perfiles de ejemplo son solo eso. Acuerda los valores que te
              convienen con tu equipo médico. Cada comida registrada guarda el
              perfil que usó.
            </p>
          </>
        ),
      },
      {
        id: "cycle",
        title: "Ciclo menstrual",
        body: (
          <>
            <p>
              El seguimiento del ciclo solo informa: nunca cambia una dosis. A
              partir del primer día de tu última regla y la duración media de tu
              ciclo calcula el día y la fase, suponiendo una regla de 5 días y
              una fase lútea de 14.
            </p>
            <p>
              Los estudios en diabetes tipo 1 apuntan a peor sensibilidad a la
              insulina en la fase lútea en parte de las mujeres, ligada a la
              progesterona, pero la evidencia no es concluyente y varía de una
              persona a otra. Por eso Musa solo sugiere cambiar de perfil el día
              1 y el primer día de la fase lútea, y la decisión es tuya.
            </p>
          </>
        ),
      },
    ],
    referencesTitle: "Referencias",
    references: [
      {
        label: "Bell KJ et al. (2020)",
        url: "https://doi.org/10.2337/dc19-0687",
        note: "+30 % de ratio para comidas grasas; importó la cantidad de grasa, no su tipo.",
      },
      {
        label: "Wolpert HA et al. (2013)",
        url: "https://doi.org/10.2337/dc12-0092",
        note: "El estudio de la pizza: +42 % de insulina de media, con mucha variación individual.",
      },
      {
        label: "Smith TA et al. (2021)",
        url: "https://doi.org/10.1111/dme.14512",
        note: "Una dosis única del 125 % superó a la dosis estándar en un desayuno graso y proteico con bolígrafo.",
      },
      {
        label: "ADA Standards of Care in Diabetes (2024)",
        note: "Recomienda +20 % como punto de partida para grasa y proteína.",
      },
      {
        label: "Ciclo menstrual y sensibilidad a la insulina en DT1 (2023)",
        url: CYCLE_REVIEW,
        note: "Revisión sistemática: menor sensibilidad en la fase lútea en parte de las mujeres; no concluyente en conjunto.",
      },
    ],
  },
};

export function DoseExplainerView({ lang }: { lang: Language }) {
  const navigate = useNavigate();
  const content = CONTENT[lang];

  return (
    <article className="explainer">
      <button
        type="button"
        className="explainer-back"
        onClick={() =>
          window.history.length > 1 ? navigate(-1) : navigate("/")
        }
      >
        ‹ {content.back}
      </button>
      <header>
        <h2 className="screen-title">{content.title}</h2>
        <p className="explainer-lead">{content.lead}</p>
      </header>

      <ol className="explainer-steps">
        {content.steps.map((step) => (
          <li key={step.title}>
            <b>{step.title}</b>
            <code>{step.formula}</code>
            <p>{step.detail}</p>
          </li>
        ))}
      </ol>

      {content.sections.map((section) => (
        <section key={section.id} id={section.id} className="explainer-section">
          <h3>{section.title}</h3>
          {section.body}
        </section>
      ))}

      <section className="explainer-section">
        <h3>{content.referencesTitle}</h3>
        <ul className="explainer-references">
          {content.references.map((reference) => (
            <li key={reference.label}>
              {reference.url ? (
                <a href={reference.url} target="_blank" rel="noreferrer">
                  {reference.label}
                </a>
              ) : (
                <b>{reference.label}</b>
              )}
              <span>{reference.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
