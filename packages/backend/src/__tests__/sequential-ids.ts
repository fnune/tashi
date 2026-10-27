import type { IdGenerator } from "../domain/ids.js";

export function uuidNumber(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export function sequentialIds(start = 1): IdGenerator {
  let next = start;
  return () => uuidNumber(next++);
}
