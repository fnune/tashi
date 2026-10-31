import { z } from "zod";

const blankIsUnset = (value: unknown) => (value === "" ? undefined : value);

const optionalText = z.preprocess(blankIsUnset, z.string().optional());

const appEnvSchema = z.object({
  BASE_PATH: z.preprocess(
    blankIsUnset,
    z
      .string()
      .refine((path) => path.startsWith("/") && !path.endsWith("/"), {
        message: "must start with / and not end with /",
      })
      .optional(),
  ),
  TIME_ZONE: optionalText,
  LLM_MODEL: z.preprocess(
    blankIsUnset,
    z.string().default("claude-haiku-4-5-20251001"),
  ),
  ANTHROPIC_API_KEY: optionalText,
  TASHI_PASSWORD: optionalText,
  TASHI_SECRET_KEY: z.preprocess(
    blankIsUnset,
    z
      .string()
      .min(32, "must be a random string of at least 32 characters")
      .optional(),
  ),
});

const nodeEnvSchema = appEnvSchema.extend({
  PORT: z.preprocess(
    blankIsUnset,
    z.coerce.number().int().min(1).max(65535).default(3000),
  ),
  DATABASE_PATH: z.string({ required_error: "required" }).min(1, "required"),
  CATALOG_DIR: optionalText,
});

export interface AppConfig {
  defaultTimeZone: string;
  basePath: string;
  model: string;
  anthropicApiKey: string | undefined;
  password: string | undefined;
  encryptionSecret: string | undefined;
}

export interface Config extends AppConfig {
  port: number;
  databasePath: string;
  catalogDir: string | undefined;
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

export function loadAppConfig(env: Record<string, unknown>): AppConfig {
  const parsed = appEnvSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error);
  return appConfigOf(parsed.data);
}

export function loadConfig(env: Record<string, unknown>): Config {
  const parsed = nodeEnvSchema.safeParse(env);
  if (!parsed.success) throw new ConfigError(parsed.error);
  const e = parsed.data;
  return {
    ...appConfigOf(e),
    port: e.PORT,
    databasePath: e.DATABASE_PATH,
    catalogDir: e.CATALOG_DIR,
  };
}

function appConfigOf(e: z.infer<typeof appEnvSchema>): AppConfig {
  return {
    defaultTimeZone:
      e.TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    basePath: e.BASE_PATH ?? "",
    model: e.LLM_MODEL,
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    password: e.TASHI_PASSWORD,
    encryptionSecret: e.TASHI_SECRET_KEY,
  };
}
