import { type Language, t } from "../i18n.js";
import { ListGroup } from "./ui/List.js";
import "./DataSources.css";

const SOURCES = [
  { id: "yours", title: "sourceYoursTitle", body: "sourceYoursBody" },
  {
    id: "usda",
    title: "sourceUsdaTitle",
    body: "sourceUsdaBody",
    url: "https://fdc.nal.usda.gov/",
  },
  {
    id: "bedca",
    title: "sourceBedcaTitle",
    body: "sourceBedcaBody",
    url: "https://www.bedca.net/bdpub/",
  },
  { id: "llm", title: "sourceLlmTitle", body: "sourceLlmBody" },
] as const;

const GI_URL = "https://glycemicindex.com/";

export function DataSources({ lang }: { lang: Language }) {
  return (
    <ListGroup title={t(lang, "dataSourcesTitle")}>
      <div className="data-sources">
        <p>{t(lang, "dataSourcesIntro")}</p>
        <ol>
          {SOURCES.map((source) => (
            <li key={source.id}>
              <b>
                {"url" in source ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {t(lang, source.title)}
                  </a>
                ) : (
                  t(lang, source.title)
                )}
              </b>
              <span>{t(lang, source.body)}</span>
            </li>
          ))}
        </ol>
        <p>
          {t(lang, "sourceGiBody")}{" "}
          <a href={GI_URL} target="_blank" rel="noreferrer">
            {t(lang, "sourceGiLink")}
          </a>
        </p>
      </div>
    </ListGroup>
  );
}
