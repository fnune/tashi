export const ENTRIES_PER_SHARD = 16;
export const searchIndexPath = "search.json";
export const entriesPath = (rank: number) =>
  `entries/${Math.floor(rank / ENTRIES_PER_SHARD)}.json`;
