import type { ApiKeyStatus, UsageSummary } from "@tashi/shared";
import { useEffect, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/Field.js";
import { ListButton, ListGroup, ListRow } from "./ui/List.js";
import { Notice } from "./ui/Notice.js";
import { Sheet } from "./ui/Sheet.js";
import "./ApiKeySettings.css";

const CONSOLE_URL = "https://console.anthropic.com/settings/keys";

export function ApiKeySettings({ id, lang }: { id: string; lang: Language }) {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getApiKeyStatus()
      .then(setStatus)
      .catch((err) => setLoadError(apiErrorText(lang, err)));
    api
      .getUsageSince(startOfThisMonth())
      .then(setUsage)
      .catch(() => setUsage(null));
  }, [lang]);

  function valueText(): string {
    if (!status?.configured) return t(lang, "notSet");
    return status.source === "environment"
      ? t(lang, "apiKeyFromServer")
      : t(lang, "apiKeySaved");
  }

  return (
    <div id={id} className="api-key-settings">
      <ListGroup title={t(lang, "apiKeyTitle")}>
        <ListButton
          label={t(lang, "apiKeyLabel")}
          detail={t(lang, "apiKeyDetail")}
          value={status ? valueText() : ""}
          onClick={() => setEditing(true)}
        />
        {usage && <UsageRow lang={lang} usage={usage} />}
      </ListGroup>
      {loadError && <Notice tone="danger">{loadError}</Notice>}

      <Sheet
        open={editing}
        title={t(lang, "apiKeyLabel")}
        closeLabel={t(lang, "close")}
        onClose={() => setEditing(false)}
      >
        <KeyEditor
          lang={lang}
          status={status}
          onChange={(next) => {
            setStatus(next);
            setEditing(false);
          }}
        />
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
  status: ApiKeyStatus | null;
  onChange: (status: ApiKeyStatus) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ApiKeyStatus>) {
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
      <a href={CONSOLE_URL} target="_blank" rel="noreferrer">
        {t(lang, "apiKeyGet")}
      </a>
      {status && !status.can_save && (
        <Notice tone="info">{t(lang, "api_key_storage_unavailable")}</Notice>
      )}
      <TextField
        label={t(lang, "apiKeyLabel")}
        secret
        value={apiKey}
        placeholder={t(lang, "apiKeyPlaceholder")}
        onChange={setApiKey}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button
        disabled={busy || !apiKey.trim() || status?.can_save === false}
        onClick={() => run(() => api.saveApiKey(apiKey.trim()))}
      >
        {busy ? t(lang, "apiKeyChecking") : t(lang, "save")}
      </Button>
      {status?.source === "settings" && (
        <Button
          variant="destructive"
          disabled={busy}
          onClick={() => run(() => api.deleteApiKey())}
        >
          {t(lang, "apiKeyRemove")}
        </Button>
      )}
    </div>
  );
}
