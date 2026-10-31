import { useEffect, useState } from "react";
import * as api from "../api.js";
import { apiErrorText, type Language, t } from "../i18n.js";
import {
  type PasswordStrength,
  passwordStrength,
  strongEnough,
} from "../password-strength.js";
import { Logo } from "./Logo.js";
import { PasswordStrengthMeter } from "./PasswordStrengthMeter.js";
import { Button } from "./ui/Button.js";
import { TextField } from "./ui/Field.js";
import { Notice } from "./ui/Notice.js";
import "./SignInView.css";

export function SetupView({
  lang,
  onSetUp,
}: {
  lang: Language;
  onSetUp: () => void;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setStrength(null);
    if (password !== "") {
      passwordStrength(password, lang, [name]).then((result) => {
        if (current) setStrength(result);
      });
    }
    return () => {
      current = false;
    };
  }, [password, name, lang]);

  const differ = again !== "" && again !== password;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.setUp(name, password);
      onSetUp();
    } catch (err) {
      setError(
        err instanceof api.ApiError && err.code === "not_found"
          ? t(lang, "setupLinkUsed")
          : apiErrorText(lang, err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="sign-in">
      <Logo className="sign-in-logo" />
      <h1>{t(lang, "setupTitle")}</h1>
      <p className="password-hint">{t(lang, "setupIntro")}</p>
      <form onSubmit={submit}>
        <TextField
          label={t(lang, "setupName")}
          value={name}
          autoComplete="username"
          onChange={setName}
        />
        <TextField
          label={t(lang, "signInPassword")}
          value={password}
          secret
          autoComplete="new-password"
          onChange={setPassword}
        />
        <PasswordStrengthMeter
          lang={lang}
          password={password}
          strength={strength}
        />
        <TextField
          label={t(lang, "setupPasswordAgain")}
          value={again}
          secret
          autoComplete="new-password"
          onChange={setAgain}
        />
        {differ && (
          <Notice tone="danger">{t(lang, "setupPasswordsDiffer")}</Notice>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button
          type="submit"
          disabled={
            busy ||
            !name.trim() ||
            !strongEnough(password, strength) ||
            again !== password
          }
        >
          {t(lang, "setupSubmit")}
        </Button>
      </form>
    </main>
  );
}
