import { Link } from "react-router";
import type { Language } from "../i18n.js";

interface FatProteinInfoViewProps {
  lang: Language;
}

export function FatProteinInfoView({ lang }: FatProteinInfoViewProps) {
  if (lang === "es") return <ContentEs />;
  return <ContentEn />;
}

function ContentEn() {
  return (
    <div className="info-page">
      <Link to="/" className="btn btn-small btn-secondary info-back">
        Back
      </Link>
      <h2>Fat and protein adjustment</h2>

      <section>
        <h3>What happens</h3>
        <p>
          High-fat and high-protein meals slow gastric emptying and stimulate
          hepatic glucose output. This causes a delayed blood sugar rise that
          typically appears 3-5 hours after eating, well after fast-acting
          insulin has peaked.
        </p>
        <p>
          The classic example is pizza: carb-counted correctly but still causing
          a late spike. Wolpert et al. (2013) found that high-fat meals required
          on average 42% more insulin than the same meal without the fat.
        </p>
      </section>

      <section>
        <h3>How the adjustment works</h3>
        <p>
          When your meal crosses a fat/protein threshold, the app adds a
          percentage of the carb-based dose as extra insulin. For MDI (pen)
          users, this is given as a single upfront injection.
        </p>
        <p>
          The default is +20%, which is conservative. The ADA recommends
          starting at +20%; the Bell 2020 trial found +30% optimal for high-fat
          meals. You can adjust the percentage in Settings based on your own CGM
          data.
        </p>
      </section>

      <section>
        <h3>Thresholds</h3>
        <p>The adjustment activates when any of these are met:</p>
        <ul>
          <li>Total fat in the meal exceeds 30g</li>
          <li>Fat exceeds 15g and protein exceeds 25g</li>
          <li>
            Fat and protein account for more than 80% of the meal's total energy
            (using general Atwater factors: fat = 9 kcal/g, protein and carbs =
            4 kcal/g; these are population averages -- food-specific values vary
            slightly, but the threshold is a clinical heuristic where that
            precision does not matter)
          </li>
        </ul>
        <p>
          Below these thresholds, plain carb counting is accurate enough.
          Applying fat/protein adjustments to normal meals is the most common
          cause of hypoglycemia in the literature.
        </p>
      </section>

      <section>
        <h3>References</h3>
        <ul className="references">
          <li>
            <a
              href="https://doi.org/10.2337/dc19-0687"
              target="_blank"
              rel="noopener noreferrer"
            >
              Bell KJ et al. (2020)
            </a>{" "}
            -- +30% ICR for high-fat meals; fat type did not matter, amount did.
          </li>
          <li>
            <a
              href="https://doi.org/10.2337/dc12-0092"
              target="_blank"
              rel="noopener noreferrer"
            >
              Wolpert HA et al. (2013)
            </a>{" "}
            -- The "pizza study"; +42% insulin on average with large individual
            variation.
          </li>
          <li>
            <a
              href="https://doi.org/10.1111/dme.14512"
              target="_blank"
              rel="noopener noreferrer"
            >
              Smith TA et al. (2021)
            </a>{" "}
            -- Single upfront 125% dose beat standard dosing for high-fat
            high-protein breakfast on MDI.
          </li>
          <li>
            ADA Standards of Care in Diabetes (2024) -- recommends +20% as
            starting point for fat/protein adjustment.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ContentEs() {
  return (
    <div className="info-page">
      <Link to="/" className="btn btn-small btn-secondary info-back">
        Volver
      </Link>
      <h2>Ajuste por grasa y proteina</h2>

      <section>
        <h3>Que ocurre</h3>
        <p>
          Las comidas altas en grasa y proteina ralentizan el vaciado gastrico y
          estimulan la produccion hepatica de glucosa. Esto provoca una subida
          tardia de glucemia que suele aparecer 3-5 horas despues de comer,
          cuando la insulina rapida ya ha pasado su pico.
        </p>
        <p>
          El ejemplo clasico es la pizza: bien contada en hidratos pero aun asi
          causa un pico tardio. Wolpert et al. (2013) encontraron que las
          comidas altas en grasa requerian de media un 42% mas de insulina.
        </p>
      </section>

      <section>
        <h3>Como funciona el ajuste</h3>
        <p>
          Cuando tu comida supera un umbral de grasa/proteina, la app añade un
          porcentaje de la dosis basada en carbohidratos como insulina extra.
          Para usuarios de plumas (MDI), se administra en una unica inyeccion.
        </p>
        <p>
          El valor por defecto es +20%, conservador. La ADA recomienda empezar
          con +20%; el ensayo de Bell (2020) encontro que +30% era optimo para
          comidas altas en grasa. Puedes ajustar el porcentaje en Ajustes segun
          tus datos de MCG.
        </p>
      </section>

      <section>
        <h3>Umbrales</h3>
        <p>El ajuste se activa cuando se cumple alguna de estas condiciones:</p>
        <ul>
          <li>La grasa total de la comida supera 30g</li>
          <li>La grasa supera 15g y la proteina supera 25g</li>
          <li>
            La grasa y la proteina representan mas del 80% de la energia total
            de la comida (usando factores Atwater generales: grasa = 9 kcal/g,
            proteina e hidratos = 4 kcal/g; estos son promedios poblacionales --
            los valores especificos por alimento varian ligeramente, pero el
            umbral es una heuristica clinica donde esa precision no importa)
          </li>
        </ul>
        <p>
          Por debajo de estos umbrales, contar carbohidratos es suficiente.
          Aplicar ajustes de grasa/proteina a comidas normales es la causa mas
          frecuente de hipoglucemia en la literatura.
        </p>
      </section>

      <section>
        <h3>Referencias</h3>
        <ul className="references">
          <li>
            <a
              href="https://doi.org/10.2337/dc19-0687"
              target="_blank"
              rel="noopener noreferrer"
            >
              Bell KJ et al. (2020)
            </a>{" "}
            -- +30% de ratio para comidas altas en grasa; el tipo de grasa no
            importo, la cantidad si.
          </li>
          <li>
            <a
              href="https://doi.org/10.2337/dc12-0092"
              target="_blank"
              rel="noopener noreferrer"
            >
              Wolpert HA et al. (2013)
            </a>{" "}
            -- El "estudio de la pizza"; +42% de insulina de media con gran
            variacion individual.
          </li>
          <li>
            <a
              href="https://doi.org/10.1111/dme.14512"
              target="_blank"
              rel="noopener noreferrer"
            >
              Smith TA et al. (2021)
            </a>{" "}
            -- Una dosis unica del 125% supero a la dosis estandar en desayunos
            altos en grasa/proteina con MDI.
          </li>
          <li>
            ADA Standards of Care in Diabetes (2024) -- recomienda +20% como
            punto de partida para ajuste por grasa/proteina.
          </li>
        </ul>
      </section>
    </div>
  );
}
