import type { Migration } from "kysely/migration";
import * as initial from "./0001-initial.js";
import * as accounts from "./0002-accounts.js";

export const migrations: Record<string, Migration> = {
  "0001-initial": initial,
  "0002-accounts": accounts,
};

export const migrationStatements: { name: string; statements: string[] }[] = [
  { name: "0001-initial", statements: initial.statements },
  { name: "0002-accounts", statements: accounts.statements },
];
