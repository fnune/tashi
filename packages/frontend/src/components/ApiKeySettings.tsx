import type { AiConnectionStatus, UsageSummary } from "@tashi/shared";
import { useEffect, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/Field.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Notice } from "./ui/Notice.js";
import { OptionList } from "./ui/OptionList.js";
import { Sheet } from "./ui/Sheet.js";
import "./ApiKeySettings.css";

const CONSOLE_URL = "https://console.anthropic.com/settings/keys";
const GUIDE_URL =
  "https://github.com/fnune/tashi/blob/main/docs/self-hosting.md#installing-on-cloudflare";

export function ApiKeySettings({ id, lang }: { id: string; lang: Language }) {
  const [status, setStatus] = useState<AiConnectionStatus | null>(null);
  const [editing, setEditing] = useState<"key" | "model" | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAiConnection()
      .then(setStatus)
      .catch((err) => setLoadError(apiErrorText(lang, err)));
    api
      .getUsageSince(startOfThisMonth())
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [lang]);

  return (
    <div id={id} className="api-key-settings">
      <ListGroup title={t(lang, "apiKeyTitle")}>
        <ListButton
          label={t(lang, "apiKeyLabel")}
          detail={t(lang, "apiKeyDetail")}
          value={
            status ? t(lang, status.connected ? "apiKeySaved" : "notSet") : ""
          }
          onClick={() => setEditing("key")}
        />
        {status?.connected && (
          <ListButton
            label={t(lang, "aiModelLabel")}
            value={
              status.models.find((m) => m.id === status.model)?.label ??
              status.model
            }
            onClick={() => setEditing("model")}
          />
        )}
        {usage && <UsageRow lang={lang} usage={usage} />}
      </ListGroup>
      {loadError && <Notice tone="danger">{loadError}</Notice>}

      <Sheet
        open={editing === "key"}
        title={t(lang, "apiKeyLabel")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <KeyEditor
          lang={lang}
          status={status}
          onChange={(next) => {
            setStatus(next);
            setEditing(null);
          }}
        />
      </Sheet>

      <Sheet
        open={editing === "model"}
        title={t(lang, "aiModelLabel")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(null)}
      >
        <p className="api-key-explainer">{t(lang, "aiModelExplainer")}</p>
        {status && (
          <OptionList
            label={t(lang, "aiModelLabel")}
            value={status.model}
            options={status.models.map((m) => ({
              value: m.id,
              title: m.label,
            }))}
            onChange={(model) => {
              setModelError(null);
              api
                .chooseAiModel(model)
                .then(setStatus)
                .catch((err) => setModelError(apiErrorText(lang, err)));
            }}
          />
        )}
        {modelError && <Notice tone="danger">{modelError}</Notice>}
      </Sheet>
    </div>
  );
}

function startOfThisMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function UsageRow({ lang, usage }: { lang: Language; usage: UsageSummary }) {
  const dollars = new Intl.NumberFormat(lang, {
    style: "currency",
    currency: "USD",
  });
  const cost = usage.estimated_cost_usd;
  const value =
    cost === null
      ? t(lang, "usageCostUnknown")
      : cost > 0 && cost < 0.01
        ? `< ${dollars.format(0.01)}`
        : `≈ ${dollars.format(cost)}`;
  const calculations = `${usage.calculations} ${t(
    lang,
    usage.calculations === 1 ? "usageCalculation" : "usageCalculations",
  )}`;
  const checkedOn = new Date(
    `${usage.prices_checked_on}T00:00:00`,
  ).toLocaleDateString(lang, { dateStyle: "medium" });
  return (
    <ListRow
      label={t(lang, "usageThisMonth")}
      detail={`${calculations} · ${t(lang, "usagePricesOf")} ${checkedOn}`}
      value={value}
    />
  );
}

function KeyEditor({
  lang,
  status,
  onChange,
}: {
  lang: Language;
  status: AiConnectionStatus | null;
  onChange: (status: AiConnectionStatus) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<AiConnectionStatus>) {
    setBusy(true);
    setError(null);
    try {
      onChange(await action());
    } catch (err) {
      setError(apiErrorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="api-key-editor">
      <p className="api-key-explainer">{t(lang, "apiKeyExplainer")}</p>
      <ol className="api-key-steps">
        <li>{t(lang, "apiKeyStep1")}</li>
        <li>{t(lang, "apiKeyStep2")}</li>
        <li>{t(lang, "apiKeyStep3")}</li>
      </ol>
      <a href={CONSOLE_URL} target="_blank" rel="noreferrer">
        {t(lang, "apiKeyGet")}
      </a>
      <a href={GUIDE_URL} target="_blank" rel="noreferrer">
        {t(lang, "apiKeyGuide")}
      </a>
      <TextField
        label={t(lang, "apiKeyLabel")}
        secret
        value={apiKey}
        placeholder={t(lang, "apiKeyPlaceholder")}
        onChange={setApiKey}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        disabled={busy || !apiKey.trim()}
        onClick={() => run(() => api.connectAi(apiKey.trim()))}
      >
        {busy ? t(lang, "apiKeyChecking") : t(lang, "save")}
      </Button>
      {status?.connected && (
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => run(() => api.disconnectAi())}
        >
          {t(lang, "apiKeyRemove")}
        </Button>
      )}
    </div>
  );
}
