const COPY = {
  en: {
    title: "Set up Tashi",
    intro:
      "Choose the name and the password you will sign in with. You can add other people later.",
    name: "Your name",
    password: "Password",
    passwordAgain: "Password again",
    passwordHint: "At least 8 characters.",
    submit: "Set up Tashi",
    different: "The two passwords are different.",
    tooShort: "The password needs at least 8 characters.",
    noName: "Choose a name.",
  },
  es: {
    title: "Configurar Tashi",
    intro:
      "Elige el nombre y la contraseña con los que entrarás. Más adelante podrás añadir a otras personas.",
    name: "Tu nombre",
    password: "Contraseña",
    passwordAgain: "Repite la contraseña",
    passwordHint: "Al menos 8 caracteres.",
    submit: "Configurar Tashi",
    different: "Las dos contraseñas no coinciden.",
    tooShort: "La contraseña necesita al menos 8 caracteres.",
    noName: "Elige un nombre.",
  },
} as const;

export type SetupLanguage = keyof typeof COPY;
export type SetupProblem = "different" | "tooShort" | "noName";

export function setupLanguage(
  acceptLanguage: string | undefined,
): SetupLanguage {
  return acceptLanguage?.trim().toLowerCase().startsWith("es") ? "es" : "en";
}

export function setupPage(options: {
  language: SetupLanguage;
  token: string;
  name?: string;
  problem?: SetupProblem;
}): string {
  const copy = COPY[options.language];
  const problem = options.problem
    ? `<p class="problem" role="alert">${copy[options.problem]}</p>`
    : "";
  return `<!doctype html>
<html lang="${options.language}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${copy.title}</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { margin: 0; padding: 2rem 1rem; }
  main { max-width: 26rem; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
  label { display: block; margin-top: 1rem; font-weight: 600; }
  input { box-sizing: border-box; width: 100%; padding: 0.7rem; margin-top: 0.3rem; font: inherit; border-radius: 0.6rem; border: 1px solid #8888; }
  small { color: #888; }
  button { margin-top: 1.5rem; width: 100%; padding: 0.8rem; font: inherit; font-weight: 600; border: 0; border-radius: 999px; background: #1e6caf; color: white; }
  .problem { padding: 0.7rem; border-radius: 0.6rem; background: #c0392b22; }
</style>
<main>
  <h1>${copy.title}</h1>
  <p>${copy.intro}</p>
  ${problem}
  <form method="post">
    <input type="hidden" name="token" value="${escapeHtml(options.token)}">
    <label for="name">${copy.name}</label>
    <input id="name" name="name" autocomplete="username" required maxlength="100" value="${escapeHtml(options.name ?? "")}">
    <label for="password">${copy.password}</label>
    <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="256">
    <small>${copy.passwordHint}</small>
    <label for="again">${copy.passwordAgain}</label>
    <input id="again" name="again" type="password" autocomplete="new-password" required minlength="8" maxlength="256">
    <button type="submit">${copy.submit}</button>
  </form>
</main>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
