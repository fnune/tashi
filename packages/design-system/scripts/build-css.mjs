// Generates tokens/tokens.css from tokens/tokens.json.
// Usage: node scripts/build-css.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(
  readFileSync(join(root, "tokens/tokens.json"), "utf8"),
);

const get = (path) => path.split(".").reduce((o, k) => o?.[k], tokens);
const resolve = (v) => {
  if (typeof v === "string" && /^\{.+\}$/.test(v)) {
    const t = get(v.slice(1, -1));
    if (!t) throw new Error(`Unresolved reference ${v}`);
    return resolve(t.$value);
  }
  return v;
};
const isToken = (o) => o && typeof o === "object" && "$value" in o;
const entries = (group) =>
  Object.entries(group).filter(([k, v]) => !k.startsWith("$") && isToken(v));

const themeVars = (name) =>
  entries(tokens.theme[name])
    .map(([k, t]) => `  --color-${k}: ${resolve(t.$value)};`)
    .join("\n");

const lines = [];
lines.push(
  "/* Generated from tokens.json by scripts/build-css.mjs. Do not edit by hand. */",
);
lines.push("");
lines.push(":root {");
lines.push(themeVars("light"));
lines.push(
  `  --font-sans: ${resolve(tokens.font.family.sans.$value)
    .map((f) => (f.includes(" ") ? `"${f}"` : f))
    .join(", ")};`,
);
for (const [k, t] of entries(tokens.font.weight))
  lines.push(`  --font-weight-${k}: ${t.$value};`);
for (const [k, t] of entries(tokens.type)) {
  const v = t.$value;
  const rem = parseFloat(v.fontSize) / 16;
  lines.push(`  --type-${k}-size: ${rem}rem;`);
  lines.push(`  --type-${k}-line: ${v.lineHeight};`);
  lines.push(`  --type-${k}-weight: ${v.fontWeight};`);
  if (v.letterSpacing)
    lines.push(`  --type-${k}-tracking: ${v.letterSpacing};`);
}
for (const [k, t] of entries(tokens.space))
  lines.push(`  --space-${k}: ${resolve(t.$value)};`);
for (const [k, t] of entries(tokens.radius))
  lines.push(`  --radius-${k}: ${t.$value};`);
for (const [k, t] of entries(tokens.size))
  lines.push(`  --size-${k}: ${t.$value};`);
lines.push(`  --motion-fast: ${tokens.motion.fast.$value};`);
lines.push(`  --motion-base: ${tokens.motion.base.$value};`);
lines.push(
  `  --motion-standard: cubic-bezier(${tokens.motion.standard.$value.join(", ")});`,
);
lines.push("  color-scheme: light;");
lines.push("}");
lines.push("");
lines.push(
  "/* Dark: follows the OS unless the app forces a theme with data-theme on <html>. */",
);
lines.push("@media (prefers-color-scheme: dark) {");
lines.push('  :root:not([data-theme="light"]) {');
lines.push(themeVars("dark").replace(/^ {2}/gm, "    "));
lines.push("    color-scheme: dark;");
lines.push("  }");
lines.push("}");
lines.push(':root[data-theme="dark"] {');
lines.push(themeVars("dark"));
lines.push("  color-scheme: dark;");
lines.push("}");
lines.push("");
lines.push("@media (prefers-reduced-motion: reduce) {");
lines.push("  :root { --motion-fast: 0ms; --motion-base: 0ms; }");
lines.push("}");
lines.push("");

writeFileSync(join(root, "tokens/tokens.css"), lines.join("\n"));
console.log("Wrote tokens/tokens.css");
