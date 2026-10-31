import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../config.js";

const DATABASE_PATH = "/var/lib/tashi/tashi.sqlite";
const minimal = { DATABASE_PATH };

describe("loadConfig", () => {
  it("falls back to defaults when only the database is given", () => {
    expect(loadConfig(minimal)).toEqual({
      port: 3000,
      databasePath: DATABASE_PATH,
      defaultTimeZone: expect.any(String),
      basePath: "",
      catalogDir: undefined,
      model: "claude-haiku-4-5-20251001",
      anthropicApiKey: undefined,
      password: undefined,
      encryptionSecret: undefined,
    });
  });

  it("will not start without a database", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_PATH/);
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
    expect(() => loadConfig({ DATABASE_PATH: "" })).toThrow(ConfigError);
    const both = () => loadConfig({ ...minimal, PORT: "abc", BASE_PATH: "x" });
    expect(both).toThrow(/PORT/);
    expect(both).toThrow(/BASE_PATH/);
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
