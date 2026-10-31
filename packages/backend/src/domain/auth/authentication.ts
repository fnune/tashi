import type { Clock } from "../clock.js";
import { DomainError } from "../errors.js";
import type { IdGenerator } from "../ids.js";
import type {
  Account,
  AccountRepository,
  SessionRepository,
  SignInFailureRepository,
} from "../repositories.js";
import {
  newDataKey,
  sessionWrappingKey,
  unwrapDataKey,
  wrapDataKey,
} from "./data-key.js";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_SALT_BYTES,
  passwordKeys,
} from "./passwords.js";
import {
  equalInConstantTime,
  fromBase64Url,
  randomBytes,
  sha256,
  toBase64Url,
} from "./tokens.js";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60_000;
export const FAILURES_BEFORE_DELAY = 5;
export const LONGEST_DELAY_MS = 15 * 60_000;

export interface SetupToken {
  accepts(token: string): Promise<boolean>;
}

export interface AuthenticationOptions {
  accounts: AccountRepository;
  sessions: SessionRepository;
  signInFailures: SignInFailureRepository;
  setupToken: SetupToken;
  clock: Clock;
  newId: IdGenerator;
  passwordIterations: number;
}

export interface Session {
  account: Account;
  dataKey: Uint8Array<ArrayBuffer>;
  renewedUntil: Date | null;
}

export class SignInThrottledError extends DomainError {
  constructor(readonly retryAfterSeconds: number) {
    super("sign_in_throttled", `Try again in ${retryAfterSeconds} s`);
  }
}

export interface Authenticator {
  isClaimed(): Promise<boolean>;
  acceptsSetupToken(token: string): Promise<boolean>;
  setUp(token: string, name: string, password: string): Promise<string>;
  signIn(name: string, password: string): Promise<string>;
  session(token: string): Promise<Session | null>;
  signOut(token: string): Promise<void>;
}

export const nameKeyOf = (name: string) =>
  name.trim().normalize("NFC").toLowerCase();

export class Authentication implements Authenticator {
  private claimed = false;

  constructor(private options: AuthenticationOptions) {}

  async isClaimed(): Promise<boolean> {
    this.claimed ||= await this.options.accounts.any();
    return this.claimed;
  }

  acceptsSetupToken(token: string): Promise<boolean> {
    return this.options.setupToken.accepts(token);
  }

  async setUp(token: string, name: string, password: string): Promise<string> {
    if (!(await this.acceptsSetupToken(token)) || (await this.isClaimed())) {
      throw new DomainError("not_found");
    }
    const trimmed = checkedName(name);
    checkPassword(password);
    const salt = randomBytes(PASSWORD_SALT_BYTES);
    const { passwordIterations: iterations, newId, clock } = this.options;
    const { verifier, keyEncryptionKey } = await passwordKeys(
      password,
      salt,
      iterations,
    );
    const dataKey = newDataKey();
    const account: Account = { id: newId(), name: trimmed, role: "admin" };
    const created = await this.options.accounts.createFirst(
      account,
      {
        id: newId(),
        salt,
        iterations,
        verifier,
        wrappedDataKey: await wrapDataKey(dataKey, keyEncryptionKey),
      },
      clock(),
    );
    if (!created) throw new DomainError("not_found");
    this.claimed = true;
    return this.startSession(account.id, dataKey);
  }

  async signIn(name: string, password: string): Promise<string> {
    const nameKey = nameKeyOf(name);
    await this.refuseWhileThrottled(nameKey);
    const found = await this.options.accounts.withPassword(nameKey);
    const salt = found?.password.salt ?? new Uint8Array(PASSWORD_SALT_BYTES);
    const iterations =
      found?.password.iterations ?? this.options.passwordIterations;
    const { verifier, keyEncryptionKey } = await passwordKeys(
      password.slice(0, PASSWORD_MAX_LENGTH),
      Uint8Array.from(salt),
      iterations,
    );
    const dataKey =
      found && equalInConstantTime(verifier, found.password.verifier)
        ? await unwrapDataKey(found.password.wrappedDataKey, keyEncryptionKey)
        : null;
    if (!found || !dataKey) {
      await this.options.signInFailures.record(nameKey, this.options.clock());
      throw new DomainError("sign_in_failed");
    }
    await this.options.signInFailures.clear(nameKey);
    return this.startSession(found.account.id, dataKey);
  }

  async session(token: string): Promise<Session | null> {
    const tokenBytes = sessionTokenBytes(token);
    if (!tokenBytes) return null;
    const tokenHash = await sha256(tokenBytes);
    const stored = await this.options.sessions.get(tokenHash);
    const now = this.options.clock().getTime();
    if (!stored || stored.stage !== "signed_in") return null;
    if (stored.expiresAt.getTime() <= now) {
      await this.options.sessions.delete(tokenHash);
      return null;
    }
    const renewedUntil =
      stored.expiresAt.getTime() - now < SESSION_LIFETIME_MS / 2
        ? new Date(now + SESSION_LIFETIME_MS)
        : null;
    if (renewedUntil) {
      await this.options.sessions.extend(tokenHash, renewedUntil);
    }
    const account = await this.options.accounts.get(stored.accountId);
    const dataKey = await unwrapDataKey(
      stored.wrappedDataKey,
      await sessionWrappingKey(tokenBytes),
    );
    return account && dataKey ? { account, dataKey, renewedUntil } : null;
  }

  async signOut(token: string): Promise<void> {
    const tokenBytes = sessionTokenBytes(token);
    if (tokenBytes)
      await this.options.sessions.delete(await sha256(tokenBytes));
  }

  private async startSession(
    accountId: string,
    dataKey: Uint8Array<ArrayBuffer>,
  ): Promise<string> {
    const token = randomBytes(32);
    const now = this.options.clock();
    await this.options.sessions.deleteExpired(accountId, now);
    await this.options.sessions.create(
      await sha256(token),
      {
        accountId,
        stage: "signed_in",
        expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        wrappedDataKey: await wrapDataKey(
          dataKey,
          await sessionWrappingKey(token),
        ),
      },
      now,
    );
    return toBase64Url(token);
  }

  private async refuseWhileThrottled(nameKey: string): Promise<void> {
    const failures = await this.options.signInFailures.get(nameKey);
    if (!failures || failures.failures < FAILURES_BEFORE_DELAY) return;
    const delay = Math.min(
      1000 * 2 ** (failures.failures - FAILURES_BEFORE_DELAY),
      LONGEST_DELAY_MS,
    );
    const waitMs =
      failures.lastFailureAt.getTime() + delay - this.options.clock().getTime();
    if (waitMs > 0) throw new SignInThrottledError(Math.ceil(waitMs / 1000));
  }
}

function sessionTokenBytes(token: string): Uint8Array<ArrayBuffer> | null {
  const bytes = fromBase64Url(token);
  return bytes && bytes.length === 32 ? bytes : null;
}

function checkedName(name: string): string {
  const trimmed = name.trim().normalize("NFC");
  if (trimmed === "" || trimmed.length > 100) {
    throw new DomainError("validation_failed", "A name of 1 to 100 characters");
  }
  return trimmed;
}

function checkPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new DomainError("password_too_short");
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new DomainError(
      "validation_failed",
      "A password of at most 256 characters",
    );
  }
}
