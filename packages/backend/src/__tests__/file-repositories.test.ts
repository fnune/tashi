import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openFileRepositories } from "../data/file-repositories.js";
import { StoredDataError } from "../data/stored-data-error.js";
import { seal } from "../domain/secret-box.js";
import { repositoryContract } from "./repository-contract.js";

repositoryContract("file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tashi-files-"));
  return {
    repositories: await openFileRepositories(dir),
    dispose: () => rm(dir, { recursive: true }),
  };
});

describe("file repositories", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tashi-files-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true });
  });

  it("creates the data directory", async () => {
    const nested = join(dir, "a", "b");
    await openFileRepositories(nested);
    expect((await stat(nested)).isDirectory()).toBe(true);
  });

  it("keeps the sealed key readable by its owner only", async () => {
    const { apiKey } = await openFileRepositories(dir);
    await apiKey.save(seal("sk", "pw"));
    expect((await stat(join(dir, "api-key.json"))).mode & 0o777).toBe(0o600);
  });

  it("fills in settings that an older file lacks", async () => {
    await writeFile(
      join(dir, "settings.json"),
      JSON.stringify({ target_blood_sugar: 90 }),
    );
    const settings = await (await openFileRepositories(dir)).settings.get();
    expect(settings.target_blood_sugar).toBe(90);
    expect(settings.language).toBe("en");
  });

  it("names the file when it is not valid JSON or not the expected shape", async () => {
    const repositories = await openFileRepositories(dir);
    await writeFile(join(dir, "settings.json"), "not json{{{");
    await writeFile(join(dir, "timeline.json"), JSON.stringify([{ id: 1 }]));
    await writeFile(join(dir, "food-vocab.json"), JSON.stringify({}));
    await expect(repositories.settings.get()).rejects.toThrow(StoredDataError);
    await expect(repositories.timeline.list()).rejects.toThrow(
      /timeline\.json/,
    );
    await expect(repositories.vocabulary.list()).rejects.toThrow(
      /food-vocab\.json/,
    );
  });
});
