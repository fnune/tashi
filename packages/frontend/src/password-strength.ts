import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@tashi/shared";
import type { Language } from "./i18n.js";

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  score: StrengthScore;
  feedback: string | null;
}

// zxcvbn's "safely unguessable": the bar every new password has to reach.
export const REQUIRED_SCORE: StrengthScore = 3;

type Check = (password: string, userInputs: string[]) => PasswordStrength;

const checks = new Map<Language, Promise<Check>>();

// The dictionaries are large, so they load only where a password is chosen.
function checkFor(lang: Language): Promise<Check> {
  let check = checks.get(lang);
  if (!check) {
    check = Promise.all([
      import("@zxcvbn-ts/core"),
      import("@zxcvbn-ts/language-common"),
      lang === "es"
        ? import("@zxcvbn-ts/language-es-es")
        : import("@zxcvbn-ts/language-en"),
    ]).then(([core, common, language]) => {
      const zxcvbn = new core.ZxcvbnFactory({
        translations: language.translations,
        graphs: common.adjacencyGraphs,
        dictionary: { ...common.dictionary, ...language.dictionary },
      });
      return (password, userInputs) => {
        const result = zxcvbn.check(password, userInputs);
        return {
          score: result.score,
          feedback:
            result.feedback.warning ?? result.feedback.suggestions[0] ?? null,
        };
      };
    });
    checks.set(lang, check);
  }
  return check;
}

export async function passwordStrength(
  password: string,
  lang: Language,
  userInputs: string[] = [],
): Promise<PasswordStrength> {
  return (await checkFor(lang))(password, ["tashi", ...userInputs]);
}

export function longEnough(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

export function strongEnough(
  password: string,
  strength: PasswordStrength | null,
): boolean {
  return (
    longEnough(password) &&
    strength !== null &&
    strength.score >= REQUIRED_SCORE
  );
}
