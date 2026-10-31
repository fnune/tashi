export function setupLinkMessage(lines: string[]): string {
  const width = Math.max(...lines.map((line) => line.length)) + 4;
  const rule = "█".repeat(width);
  const padded = lines.map((line) => `█ ${line.padEnd(width - 4)} █`);
  return ["", rule, ...padded, rule, ""].join("\n");
}

export function setupLinkLines(link: string): string[] {
  return [
    "",
    "TASHI IS READY TO BE SET UP",
    "",
    "Open this link to choose your name and password:",
    "",
    link,
    "",
    "Only someone with this link can set Tashi up. It stops working",
    "once Tashi has an account.",
    "",
  ];
}
