import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(import.meta.dirname, "..");

const allowedImports: Record<string, string[]> = {
  domain: ["domain"],
  http: ["domain", "http"],
  data: ["domain", "data"],
};

function sourceFiles(layer: string): string[] {
  return readdirSync(join(src, layer))
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(src, layer, name));
}

function localImports(file: string): string[] {
  const code = readFileSync(file, "utf-8");
  return [...code.matchAll(/from\s+"(\.{1,2}\/[^"]+)"/g)].map((m) =>
    resolve(file, "..", m[1] ?? ""),
  );
}

describe("layers", () => {
  for (const [layer, allowed] of Object.entries(allowedImports)) {
    it(`${layer} only imports from ${allowed.join(" and ")}`, () => {
      const offenders = sourceFiles(layer).flatMap((file) =>
        localImports(file)
          .filter((target) => {
            const folder = target.slice(src.length + 1).split("/")[0] ?? "";
            return !allowed.includes(folder);
          })
          .map(
            (target) =>
              `${file.slice(src.length + 1)} -> ${target.slice(src.length + 1)}`,
          ),
      );
      expect(offenders).toEqual([]);
    });
  }

  it("keeps the web framework and the storage libraries out of the domain", () => {
    const forbidden = /from\s+"(hono|hono\/[^"]+|sql\.js|@hono\/[^"]+)"/;
    const offenders = sourceFiles("domain").filter((file) =>
      forbidden.test(readFileSync(file, "utf-8")),
    );
    expect(offenders).toEqual([]);
  });
});
