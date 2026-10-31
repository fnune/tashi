import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../config.js";

const DATABASE_URL = "postgres://tashi@localhost/tashi";
const minimal = { DATABASE_URL };

describe("loadConfig", () => {
  it("falls back to defaults when only the database is given", () => {
    expect(loadConfig(minimal)).toEqual({
      port: 3000,
      databaseUrl: DATABASE_URL,
      defaultTimeZone: expect.any(String),
      basePath: "",
      foodsDbPath: undefined,
      catalogDir: undefined,
      model: "claude-haiku-4-5-20251001",
      anthropicApiKey: undefined,
      password: undefined,
      encryptionSecret: undefined,
    });
  });

  it("will not start without a database", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });

  it("treats blank variables as unset", () => {
    const config = loadConfig({
      ...minimal,
      PORT: "",
      TASHI_PASSWORD: "",
      ANTHROPIC_API_KEY: "",
      TIME_ZONE: "",
    });
    expect(config.port).toBe(3000);
    expect(config.password).toBeUndefined();
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it("encrypts with TASHI_SECRET_KEY only, never with the password", () => {
    const secret = "a".repeat(32);
    expect(
      loadConfig({ ...minimal, TASHI_PASSWORD: "pw" }).encryptionSecret,
    ).toBeUndefined();
    expect(
      loadConfig({ ...minimal, TASHI_PASSWORD: "pw", TASHI_SECRET_KEY: secret })
        .encryptionSecret,
    ).toBe(secret);
  });

  it("names every variable that is wrong instead of starting on a bad value", () => {
    for (const env of [
      { PORT: "abc" },
      { PORT: "0" },
      { PORT: "70000" },
      { BASE_PATH: "tashi" },
      { BASE_PATH: "/tashi/" },
      { TASHI_SECRET_KEY: "too short" },
    ]) {
      expect(() => loadConfig({ ...minimal, ...env })).toThrow(ConfigError);
    }
    for (const url of ["mysql://localhost/tashi", "postgres"]) {
      expect(() => loadConfig({ DATABASE_URL: url })).toThrow(ConfigError);
    }
    expect(() =>
      loadConfig({ ...minimal, PORT: "abc", BASE_PATH: "x" }),
    ).toThrow(/PORT.*BASE_PATH/);
  });

  it("accepts a Postgres connection string with options", () => {
    const url = "postgresql://u:p@host:5432/db?sslmode=require";
    expect(loadConfig({ DATABASE_URL: url }).databaseUrl).toBe(url);
  });

  it("accepts a base path under a prefix", () => {
    expect(loadConfig({ ...minimal, BASE_PATH: "/tashi" }).basePath).toBe(
      "/tashi",
    );
  });

  it("takes the time zone from the environment, else from the machine", () => {
    expect(
      loadConfig({ ...minimal, TIME_ZONE: "Asia/Tokyo" }).defaultTimeZone,
    ).toBe("Asia/Tokyo");
    expect(loadConfig(minimal).defaultTimeZone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});
