import { MAX_PASSWORD_LENGTH } from "@tashi/shared";
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { csrf } from "hono/csrf";
import { z } from "zod";
import {
  type Authenticator,
  SESSION_LIFETIME_MS,
  type Session,
  SignInThrottledError,
} from "../domain/auth/authentication.js";
import { DomainError } from "../domain/errors.js";
import type { Logger } from "../domain/logger.js";
import { apiError } from "./api-error.js";

export const SESSION_COOKIE = "tashi_session";
export const SETUP_COOKIE = "tashi_setup";
const SETUP_COOKIE_SECONDS = 60 * 60;

export interface SignedIn {
  Variables: { session: Session };
}

const signInSchema = z.object({
  name: z.string().max(100),
  password: z.string().max(MAX_PASSWORD_LENGTH),
});

const setupSchema = z.object({
  name: z.string().max(100),
  password: z.string().max(MAX_PASSWORD_LENGTH),
});

export function authenticate(
  app: Hono<SignedIn>,
  authentication: Authenticator,
  basePath: string,
  logger: Logger,
): void {
  const at = (path: string) => `${basePath}${path}`;
  const cookiePath = basePath || "/";

  // Until someone sets the instance up, it answers only to the setup link
  // and to the browser that opened it, which carries the token in a cookie.
  app.use("*", async (c, next) => {
    if (
      (await authentication.isClaimed()) ||
      (await openToSetup(authentication, getCookie(c, SETUP_COOKIE))) ||
      (c.req.path === at("/setup") &&
        (await openToSetup(authentication, c.req.query("token"))))
    ) {
      return next();
    }
    return c.text("Not found", 404);
  });

  app.use("*", csrf());

  app.get(at("/setup"), async (c, next) => {
    const token = c.req.query("token");
    if (token === undefined) return next();
    if (!(await openToSetup(authentication, token))) {
      return c.text("Not found", 404);
    }
    setCookie(c, SETUP_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
      path: cookiePath,
      maxAge: SETUP_COOKIE_SECONDS,
    });
    return c.redirect(at("/setup"), 303);
  });

  app.post(at("/api/setup"), async (c) => {
    const token = getCookie(c, SETUP_COOKIE);
    if (!(await openToSetup(authentication, token)) || token === undefined) {
      return apiError(c, "not_found", 404);
    }
    const parsed = setupSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    try {
      setSessionCookie(
        c,
        await authentication.setUp(
          token,
          parsed.data.name,
          parsed.data.password,
        ),
      );
    } catch (error) {
      if (error instanceof DomainError) {
        return apiError(c, error.code, error.code === "not_found" ? 404 : 400);
      }
      throw error;
    }
    deleteCookie(c, SETUP_COOKIE, { path: cookiePath, secure: true });
    logger.info("set_up");
    return c.json({ ok: true });
  });

  app.post(at("/api/auth/sign-in"), async (c) => {
    const parsed = signInSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return apiError(c, "validation_failed", 400, parsed.error.message);
    }
    try {
      setSessionCookie(
        c,
        await authentication.signIn(parsed.data.name, parsed.data.password),
      );
    } catch (error) {
      if (error instanceof SignInThrottledError) {
        logger.warn("sign_in_throttled", {
          retry_after_s: error.retryAfterSeconds,
        });
        c.header("Retry-After", String(error.retryAfterSeconds));
        return apiError(c, "sign_in_throttled", 429);
      }
      if (error instanceof DomainError && error.code === "sign_in_failed") {
        logger.info("sign_in_failed");
        return apiError(c, "sign_in_failed", 401);
      }
      throw error;
    }
    logger.info("signed_in");
    return c.json({ ok: true });
  });

  app.post(at("/api/auth/sign-out"), async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await authentication.signOut(token);
    deleteCookie(c, SESSION_COOKIE, { path: cookiePath, secure: true });
    return c.json({ ok: true });
  });

  app.use(at("/api/*"), async (c, next) => {
    if (c.req.path === at("/api/health") || c.req.path === at("/api/setup")) {
      return next();
    }
    const token = getCookie(c, SESSION_COOKIE);
    const session = token ? await authentication.session(token) : null;
    if (!session) return apiError(c, "signed_out", 401);
    if (session.renewedUntil && token) setSessionCookie(c, token);
    c.set("session", session);
    return next();
  });

  app.get(at("/api/auth/me"), (c) => {
    const { account } = c.get("session");
    return c.json({ name: account.name, role: account.role });
  });

  function setSessionCookie(c: Context, token: string): void {
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: cookiePath,
      maxAge: SESSION_LIFETIME_MS / 1000,
    });
  }
}

async function openToSetup(
  authentication: Authenticator,
  token: string | undefined,
): Promise<boolean> {
  return (
    token !== undefined &&
    token !== "" &&
    !(await authentication.isClaimed()) &&
    (await authentication.acceptsSetupToken(token))
  );
}
