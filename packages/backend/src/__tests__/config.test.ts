import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../config.js";

describe("loadConfig", () => {
  it("falls back to defaults for an empty environment", () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      dataDir: "./data",
      databaseUrl: undefined,
      basePath: "",
      foodsDbPath: undefined,
      model: "claude-haiku-4-5-20251001",
      anthropicApiKey: undefined,
      password: undefined,
      encryptionPassphrase: undefined,
    });
  });

  it("treats blank variables as unset", () => {
    const config = loadConfig({
      PORT: "",
      TASHI_PASSWORD: "",
      ANTHROPIC_API_KEY: "",
    });
    expect(config.port).toBe(3000);
    expect(config.password).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it("encrypts with TASHI_SECRET_KEY, else with the password", () => {
    expect(loadConfig({ TASHI_PASSWORD: "pw" }).encryptionPassphrase).toBe(
      "pw",
    );
    expect(
      loadConfig({ TASHI_PASSWORD: "pw", TASHI_SECRET_KEY: "secret" })
        .encryptionPassphrase,
    ).toBe("secret");
  });

  it("names every variable that is wrong instead of starting on a bad value", () => {
    for (const env of [
      { PORT: "abc" },
      { PORT: "0" },
      { PORT: "70000" },
      { BASE_PATH: "tashi" },
      { BASE_PATH: "/tashi/" },
      { DATABASE_URL: "mysql://localhost/tashi" },
      { DATABASE_URL: "postgres" },
    ]) {
      expect(() => loadConfig(env)).toThrow(ConfigError);
    }
    expect(() => loadConfig({ PORT: "abc", BASE_PATH: "x" })).toThrow(
      /PORT.*BASE_PATH/,
    );
  });

  it("accepts a Postgres connection string", () => {
    expect(
      loadConfig({
        DATABASE_URL: "postgresql://u:p@host:5432/db?sslmode=require",
      }).databaseUrl,
    ).toBe("postgresql://u:p@host:5432/db?sslmode=require");
  });

  it("accepts a base path under a prefix", () => {
    expect(loadConfig({ BASE_PATH: "/tashi" }).basePath).toBe("/tashi");
  });
});
