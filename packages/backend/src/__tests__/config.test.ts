import { describe, expect, it } from "vitest";
import { ServerOptionsError, serverOptions, withBaseHref } from "../config.js";

const DATABASE = ["--database", "/var/lib/tashi/tashi.sqlite"];

describe("the server's options", () => {
  it("fall back to defaults when only the database is given", () => {
    expect(serverOptions(DATABASE)).toEqual({
      databasePath: "/var/lib/tashi/tashi.sqlite",
      port: 3000,
      basePath: "",
    });
  });

  it("take a port and a base path", () => {
    expect(
      serverOptions([
        ...DATABASE,
        "--port",
        "3210",
        "--base-path",
        "/apps/tashi",
      ]),
    ).toMatchObject({ port: 3210, basePath: "/apps/tashi" });
  });

  it("ask for help", () => {
    expect(serverOptions(["--help"])).toBe("help");
  });

  it("refuse to start without a database", () => {
    expect(() => serverOptions([])).toThrow(/--database is required/);
  });

  it("name what is wrong instead of starting on a bad value", () => {
    for (const args of [
      ["--port", "abc"],
      ["--port", "0"],
      ["--base-path", "tashi"],
      ["--base-path", "/tashi/"],
      ["--base-path", "/a b"],
      ["--databse", "typo.sqlite"],
      ["positional"],
    ]) {
      expect(() => serverOptions([...DATABASE, ...args])).toThrow(
        ServerOptionsError,
      );
    }
  });
});

describe("the page's base", () => {
  it("is the base path, so links resolve under it", () => {
    expect(withBaseHref('<head><base href="/" /></head>', "/apps/tashi")).toBe(
      '<head><base href="/apps/tashi/" /></head>',
    );
    expect(withBaseHref('<base href="/" />', "")).toBe('<base href="/" />');
  });
});
