import type { IdGenerator } from "../domain/ids.js";

export function sequentialIds(prefix = "id"): IdGenerator {
  let next = 0;
  return () => `${prefix}-${++next}`;
}
