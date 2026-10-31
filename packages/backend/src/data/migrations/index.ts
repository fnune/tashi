import type { Migration } from "kysely/migration";
import * as initial from "./0001-initial.js";

export const migrations: Record<string, Migration> = {
  "0001-initial": initial,
};

export const migrationStatements: { name: string; statements: string[] }[] = [
  { name: "0001-initial", statements: initial.statements },
];
