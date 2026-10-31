import type { Flag, Instant } from "../database.js";

export const instantOf = (timestamp: string | Date): Instant =>
  new Date(timestamp).toISOString();

export const flagOf = (value: boolean): Flag => (value ? 1 : 0);
