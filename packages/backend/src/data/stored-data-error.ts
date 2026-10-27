export class StoredDataError extends Error {
  constructor(source: string, cause: unknown) {
    super(`Stored data in ${source} is not in the expected shape`, { cause });
    this.name = "StoredDataError";
  }
}
