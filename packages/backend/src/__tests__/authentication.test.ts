import { describe, expect, it } from "vitest";
import {
  Authentication,
  FAILURES_BEFORE_DELAY,
  SESSION_LIFETIME_MS,
  type SetupToken,
} from "../domain/auth/authentication.js";
import { fromBase64Url, sha256 } from "../domain/auth/tokens.js";
import { DomainError } from "../domain/errors.js";
import { createInMemoryRepositories } from "./in-memory-repositories.js";
import { sequentialIds } from "./sequential-ids.js";

const SETUP_TOKEN = "the-setup-token";
const setupToken: SetupToken = {
  accepts: async (token) => token === SETUP_TOKEN,
};

function authentication() {
  let now = new Date("2026-06-13T12:00:00.000Z");
  const repositories = createInMemoryRepositories();
  const auth = new Authentication({
    ...repositories,
    setupToken,
    clock: () => now,
    newId: sequentialIds(),
    passwordIterations: 1000,
  });
  return {
    auth,
    repositories,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

async function failsWith(promise: Promise<unknown>, code: string) {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DomainError);
  expect(error).toMatchObject({ code });
}

describe("setting up an instance", () => {
  it("is closed to anyone without the setup token", async () => {
    const { auth } = authentication();
    expect(await auth.isClaimed()).toBe(false);
    await failsWith(auth.setUp("guess", "Ana", "long enough!"), "not_found");
    expect(await auth.isClaimed()).toBe(false);
  });

  it("creates the first account and signs it in", async () => {
    const { auth } = authentication();
    const token = await auth.setUp(SETUP_TOKEN, " Ana ", "long enough!");
    expect(await auth.isClaimed()).toBe(true);
    expect((await auth.session(token))?.account).toMatchObject({
      name: "Ana",
      role: "admin",
    });
  });

  it("closes once an account exists, even to the setup token", async () => {
    const { auth } = authentication();
    await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    await failsWith(
      auth.setUp(SETUP_TOKEN, "Eve", "long enough!"),
      "not_found",
    );
  });

  it("asks for a password of at least 12 characters", async () => {
    const { auth } = authentication();
    await failsWith(
      auth.setUp(SETUP_TOKEN, "Ana", "eleven char"),
      "password_too_short",
    );
  });
});

describe("signing in", () => {
  it("opens a session with the same data key the setup made", async () => {
    const { auth } = authentication();
    const first = await auth.session(
      await auth.setUp(SETUP_TOKEN, "Ana", "long enough!"),
    );
    const second = await auth.session(await auth.signIn("ANA", "long enough!"));
    expect(second?.account).toEqual(first?.account);
    expect(second?.dataKey).toEqual(first?.dataKey);
  });

  it("gives the same answer for a wrong password and an unknown name", async () => {
    const { auth } = authentication();
    await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    await failsWith(auth.signIn("Ana", "wrong password"), "sign_in_failed");
    await failsWith(auth.signIn("Nobody", "long enough!"), "sign_in_failed");
  });

  it("makes each attempt wait longer after repeated failures", async () => {
    const { auth, advance } = authentication();
    await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    for (let i = 0; i < FAILURES_BEFORE_DELAY; i++) {
      await failsWith(auth.signIn("Ana", "wrong password"), "sign_in_failed");
    }
    await failsWith(auth.signIn("Ana", "long enough!"), "sign_in_throttled");
    advance(1000);
    expect(await auth.signIn("Ana", "long enough!")).toEqual(
      expect.any(String),
    );
  });
});

describe("sessions", () => {
  it("lasts while it is used and ends when it is not", async () => {
    const { auth, advance } = authentication();
    const token = await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    advance(SESSION_LIFETIME_MS * 0.75);
    expect(await auth.session(token)).not.toBeNull();
    advance(SESSION_LIFETIME_MS * 0.75);
    expect(await auth.session(token)).not.toBeNull();
    advance(SESSION_LIFETIME_MS + 1);
    expect(await auth.session(token)).toBeNull();
  });

  it("leaves no expired session behind once its account signs in again", async () => {
    const { auth, repositories, advance } = authentication();
    const old = await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    advance(SESSION_LIFETIME_MS + 1);
    await auth.signIn("Ana", "long enough!");
    const oldHash = await sha256(fromBase64Url(old) ?? new Uint8Array());
    expect(await repositories.sessions.get(oldHash)).toBeNull();
  });

  it("says when it was renewed, so the cookie can be renewed with it", async () => {
    const { auth, advance } = authentication();
    const token = await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    expect((await auth.session(token))?.renewedUntil).toBeNull();
    advance(SESSION_LIFETIME_MS * 0.75);
    expect((await auth.session(token))?.renewedUntil).toEqual(expect.any(Date));
  });

  it("ends when signing out", async () => {
    const { auth } = authentication();
    const token = await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    await auth.signOut(token);
    expect(await auth.session(token)).toBeNull();
  });

  it("knows nothing of a token it did not make", async () => {
    const { auth } = authentication();
    await auth.setUp(SETUP_TOKEN, "Ana", "long enough!");
    expect(await auth.session("not-a-token")).toBeNull();
    expect(await auth.session("A".repeat(43))).toBeNull();
  });
});
