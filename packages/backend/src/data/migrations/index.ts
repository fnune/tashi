import type { Migration } from "kysely/migration";
import * as initial from "./0001-initial.js";
import * as catalog from "./0002-catalog.js";

export const migrations: Record<string, Migration> = {
  "0001-initial": initial,
  "0002-catalog": catalog,
};
