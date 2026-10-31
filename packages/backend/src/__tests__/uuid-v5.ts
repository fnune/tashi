import { createHash } from "node:crypto";

export function uuidV5(name: string, namespace: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replaceAll("-", ""), "hex"))
    .update(name)
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
