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
import { apiError } from "./api-error.js";
import { type SetupProblem, setupLanguage, setupPage } from "./setup-page.js";

export const SESSION_COOKIE = "tashi_session";

export interface SignedIn {
  Variables: { session: Session };
}

const signInSchema = z.object({
  name: z.string().max(100),
  password: z.string().max(1024),
});

const setupFormSchema = z.object({
  token: z.string(),
  name: z.string(),
  password: z.string(),
  again: z.string(),
});

export function authenticate(
  app: Hono<SignedIn>,
  authentication: Authenticator,
  basePath: string,
): void {
  const at = (path: string) => `${basePath}${path}`;
  const cookiePath = basePath || "/";

  app.use("*", async (c, next) => {
    if ((await authentication.isClaimed()) || c.req.path === at("/setup")) {
      return next();
    }
    return c.text("Not found", 404);
  });

  app.use("*", csrf());

  app.get(at("/setup"), async (c) => {
    const token = c.req.query("token") ?? "";
    if (!(await openToSetup(authentication, token))) {
      return c.text("Not found", 404);
    }
    return c.html(
      setupPage({
        language: setupLanguage(c.req.header("Accept-Language")),
        token,
      }),
    );
  });

  app.post(at("/setup"), async (c) => {
    const form = setupFormSchema.safeParse(await c.req.parseBody());
    if (
      !form.success ||
      !(await openToSetup(authentication, form.data.token))
    ) {
      return c.text("Not found", 404);
    }
    const { token, name, password, again } = form.data;
    const language = setupLanguage(c.req.header("Accept-Language"));
    const showProblem = (problem: SetupProblem) =>
      c.html(setupPage({ language, token, name, problem }), 400);
    if (name.trim() === "") return showProblem("noName");
    if (password !== again) return showProblem("different");
    try {
      setSessionCookie(c, await authentication.setUp(token, name, password));
    } catch (error) {
      if (error instanceof DomainError && error.code === "password_too_short") {
        return showProblem("tooShort");
      }
      if (error instanceof DomainError && error.code === "validation_failed") {
        return showProblem("noName");
      }
      throw error;
    }
    return c.redirect(cookiePath, 303);
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
        c.header("Retry-After", String(error.retryAfterSeconds));
        return apiError(c, "sign_in_throttled", 429);
      }
      if (error instanceof DomainError && error.code === "sign_in_failed") {
        return apiError(c, "sign_in_failed", 401);
      }
      throw error;
    }
    return c.json({ ok: true });
  });

  app.post(at("/api/auth/sign-out"), async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await authentication.signOut(token);
    deleteCookie(c, SESSION_COOKIE, { path: cookiePath, secure: true });
    return c.json({ ok: true });
  });

  app.use(at("/api/*"), async (c, next) => {
    if (c.req.path === at("/api/health")) return next();
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
  token: string,
): Promise<boolean> {
  return (
    token !== "" &&
    !(await authentication.isClaimed()) &&
    (await authentication.acceptsSetupToken(token))
  );
}
