import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { newSetupToken } from "../src/domain/auth/setup-token.js";
import { setupLinkLines, setupLinkMessage } from "../src/setup-link.js";

const [wranglerConfig, output] = process.argv.slice(2);
if (!wranglerConfig || !output) {
  console.error("Usage: build-setup-link <wrangler.jsonc> <output.json>");
  process.exit(1);
}

const { token, sha256Hex } = await newSetupToken();
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ sha256: sha256Hex }));

const workerName = (await readFile(wranglerConfig, "utf8")).match(
  /"name":\s*"([^"]+)"/,
)?.[1];
const address = workerName ? await workersDevAddress(workerName) : null;
const path = `/setup?token=${token}`;
console.log(
  setupLinkMessage(
    address
      ? setupLinkLines(`${address}${path}`)
      : [
          ...setupLinkLines(`<your Tashi address>${path}`),
          "Your Tashi address is the https://…workers.dev address at the end",
          "of this log. Put it in front of /setup.",
          "",
        ],
  ),
);

async function workersDevAddress(name: string): Promise<string | null> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !apiToken) return null;
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    );
    const body: unknown = await response.json();
    const subdomain =
      typeof body === "object" &&
      body !== null &&
      "result" in body &&
      typeof body.result === "object" &&
      body.result !== null &&
      "subdomain" in body.result &&
      typeof body.result.subdomain === "string"
        ? body.result.subdomain
        : null;
    return subdomain ? `https://${name}.${subdomain}.workers.dev` : null;
  } catch {
    return null;
  }
}
