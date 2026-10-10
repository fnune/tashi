// Checks WCAG 2.2 contrast for every colour pair the components use, in both themes.
// Usage: node scripts/check-contrast.mjs            (prints a table, exits 1 on failure)
//        node scripts/check-contrast.mjs --markdown (prints the table used in docs/accessibility.md)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(
  readFileSync(join(root, "tokens/tokens.json"), "utf8"),
);
const get = (path) => path.split(".").reduce((o, k) => o?.[k], tokens);
const resolve = (v) =>
  typeof v === "string" && /^\{.+\}$/.test(v)
    ? resolve(get(v.slice(1, -1)).$value)
    : v;

const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// [foreground, background, minimum, what it is]
// 4.5 = normal text, 3 = large text (24px+, or 19px+ bold) and non-text UI parts (icons, focus ring, chart line)
const PAIRS = [
  ["fg", "bg", 4.5, "Body text"],
  ["fg", "fill", 4.5, "Text on chips, segments, inputs"],
  ["fg-muted", "bg", 4.5, "Secondary text"],
  ["fg-muted", "fill", 4.5, "Unselected segment labels"],
  ["accent-text", "bg", 4.5, "Accent values, links"],
  ["accent-text", "fill", 4.5, "Accent text on fills"],
  ["on-accent", "accent", 4.5, "Primary button label, selected chip"],
  ["inverse-fg", "inverse-bg", 4.5, "Selected segment label"],
  ["accent", "bg", 3, "Focus ring, chart line, active nav"],
  ["glucose", "bg", 4.5, "Glucose icon and in-range text"],
  ["insulin-rapid", "bg", 4.5, "Rapid insulin icon and label"],
  ["insulin-basal", "bg", 4.5, "Basal insulin icon and label"],
  ["glucose", "fill", 3, "Glucose icon on quick-add tile"],
  ["insulin-rapid", "fill", 3, "Rapid icon on quick-add tile"],
  ["insulin-basal", "fill", 3, "Basal icon on quick-add tile"],
  ["warning", "bg", 4.5, "Warning text"],
  ["error", "bg", 4.5, "Error text"],
  ["cycle-luteal", "bg", 3, "Cycle phase dot and bar"],
  ["cycle-menstrual", "bg", 3, "Cycle phase bar"],
  ["cycle-follicular", "bg", 3, "Cycle phase bar"],
  ["cycle-ovulation", "bg", 3, "Cycle phase bar"],
];

const md = process.argv.includes("--markdown");
let failed = 0;
const out = [];
if (md)
  out.push("| Pair | Use | Min | Light | Dark |", "|---|---|---|---|---|");
for (const [f, b, min, use] of PAIRS) {
  const cells = ["light", "dark"].map((th) => {
    const r = ratio(
      resolve(tokens.theme[th][f].$value),
      resolve(tokens.theme[th][b].$value),
    );
    if (r < min) failed++;
    return `${r.toFixed(2)}${r < min ? " FAIL" : ""}`;
  });
  out.push(
    md
      ? `| \`${f}\` on \`${b}\` | ${use} | ${min} | ${cells[0]} | ${cells[1]} |`
      : `${(f + " on " + b).padEnd(30)} min ${min}  light ${cells[0].padEnd(10)} dark ${cells[1]}`,
  );
}
console.log(out.join("\n"));
if (!md)
  console.log(failed ? `\n${failed} failing pair(s)` : "\nAll pairs pass.");
process.exit(failed ? 1 : 0);
