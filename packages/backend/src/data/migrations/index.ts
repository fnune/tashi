import type { Migration } from "kysely/migration";
import * as initial from "./0001-initial.js";

export const migrations: Record<string, Migration> = {
  "0001-initial": initial,
};
