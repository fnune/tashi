import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ReadAsset } from "./static-food-catalog.js";

export function diskAssets(directory: string): ReadAsset {
  return async (path) => {
    try {
      return JSON.parse(await readFile(join(directory, path), "utf8"));
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return null;
      }
      throw error;
    }
  };
}

export async function writeAssets(
  directory: string,
  files: Map<string, unknown>,
): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  for (const [path, content] of files) {
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(content));
  }
}

export function memoryAssets(files: Map<string, unknown>): ReadAsset {
  return async (path) => {
    const content = files.get(path);
    return content === undefined ? null : structuredClone(content);
  };
}
