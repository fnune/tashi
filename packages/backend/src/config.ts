import { z } from "zod";

const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);

const optionalText = z.preprocess(blankIsUnset, z.string().optional());

const envSchema = z.object({
  PORT: z.preprocess(
    blankIsUnset,
    z.coerce.number().int().min(1).max(65535).default(3000),
  ),
  DATA_DIR: z.preprocess(blankIsUnset, z.string().default("./data")),
  BASE_PATH: z.preprocess(
    blankIsUnset,
    z
      .string()
      .refine((path) => path.startsWith("/") && !path.endsWith("/"), {
        message: "must start with / and not end with /",
      })
      .optional(),
  ),
  DATABASE_URL: z.preprocess(
    blankIsUnset,
    z
      .string()
      .refine((url) => /^postgres(ql)?:\/\//.test(url), {
        message: "must be a postgres:// or postgresql:// URL",
      })
      .optional(),
  ),
  FOODS_DB: optionalText,
  LLM_MODEL: z.preprocess(
    blankIsUnset,
    z.string().default("claude-haiku-4-5-20251001"),
  ),
  ANTHROPIC_API_KEY: optionalText,
  TASHI_PASSWORD: optionalText,
  TASHI_SECRET_KEY: optionalText,
});

export interface Config {
  port: number;
  dataDir: string;
  databaseUrl: string | undefined;
  basePath: string;
  foodsDbPath: string | undefined;
  model: string;
  anthropicApiKey: string | undefined;
  password: string | undefined;
  encryptionPassphrase: string | undefined;
}

export class ConfigError extends Error {
  constructor(cause: z.ZodError) {
    const problems = cause.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    super(`Invalid environment: ${problems}`, { cause });
    this.name = "ConfigError";
  }
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error);
  const e = parsed.data;
  return {
    port: e.PORT,
    dataDir: e.DATA_DIR,
    databaseUrl: e.DATABASE_URL,
    basePath: e.BASE_PATH ?? "",
    foodsDbPath: e.FOODS_DB,
    model: e.LLM_MODEL,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    password: e.TASHI_PASSWORD,
    encryptionPassphrase: e.TASHI_SECRET_KEY ?? e.TASHI_PASSWORD,
  };
}
