import { useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import { Logo } from "./Logo.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/Field.js";
import { Notice } from "./ui/Notice.js";
import "./SignInView.css";

export function SignInView({
  lang,
  onSignedIn,
}: {
  lang: Language;
  onSignedIn: () => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.signIn(name, password);
      onSignedIn();
    } catch (err) {
      setError(apiErrorText(lang, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <Logo className="sign-in-logo" />
      <h1>{t(lang, "signInTitle")}</h1>
      <form onSubmit={submit}>
        <TextField
          label={t(lang, "signInName")}
          value={name}
          autoComplete="username"
          onChange={setName}
        />
        <TextField
          label={t(lang, "signInPassword")}
          value={password}
          secret
          autoComplete="current-password"
          onChange={setPassword}
        />
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" disabled={busy || !name.trim() || !password}>
          {t(lang, "signIn")}
        </Button>
      </form>
    </main>
  );
}
