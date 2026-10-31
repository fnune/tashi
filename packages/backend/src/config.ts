import { parseArgs } from "node:util";
import { z } from "zod";

export interface AppConfig {
  basePath: string;
}

export interface ServerOptions extends AppConfig {
  databasePath: string;
  port: number;
}

export const SERVER_USAGE = `Usage: tashi --database <file> [--port <number>] [--base-path <path>]

Runs Tashi on your own server. Tashi on Cloudflare needs none of these.

  --database <file>    SQLite file to keep the data in, created and updated on start
  --port <number>      port to listen on (default 3000)
  --base-path <path>   path Tashi is served under behind a proxy, such as /tashi
  --help               show this help`;

export class ServerOptionsError extends Error {
  constructor(problem: string) {
    super(`${problem}\n\n${SERVER_USAGE}`);
    this.name = "ServerOptionsError";
  }
}

const optionsSchema = z.object({
  database: z.string({ required_error: "is required" }).min(1, "is required"),
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  "base-path": z
    .string()
    .regex(
      /^(\/[A-Za-z0-9._~-]+)*$/,
      "must start with / and not end with /, such as /tashi",
    )
    .default(""),
});

export function serverOptions(args: string[]): ServerOptions | "help" {
  let values: Record<string, string | boolean | undefined>;
  try {
    values = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        database: { type: "string" },
        port: { type: "string" },
        "base-path": { type: "string" },
        help: { type: "boolean" },
      },
    }).values;
  } catch (error) {
    throw new ServerOptionsError(
      error instanceof Error ? error.message : String(error),
    );
  }
  if (values.help) return "help";
  const parsed = optionsSchema.safeParse(values);
  if (!parsed.success) {
    throw new ServerOptionsError(
      parsed.error.issues
        .map((issue) => `--${issue.path.join(".")} ${issue.message}`)
        .join("\n"),
    );
  }
  return {
    databasePath: parsed.data.database,
    port: parsed.data.port,
    basePath: parsed.data["base-path"],
  };
}

export function withBaseHref(html: string, basePath: string): string {
  return html.replace('<base href="/" />', `<base href="${basePath}/" />`);
}
