import { nameKeyOf } from "../../domain/auth/authentication.js";
import type {
  Account,
  AccountRepository,
  PasswordMethod,
} from "../../domain/repositories.js";
import type { Db } from "../database.js";
import type { WriteBatch } from "../write-batch.js";
import { instantOf } from "./columns.js";

export class SqliteAccountRepository implements AccountRepository {
  constructor(
    private db: Db,
    private batch: WriteBatch,
  ) {}

  async any(): Promise<boolean> {
    const row = await this.db
      .selectFrom("accounts")
      .select("id")
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  }

  async createFirst(
    account: Account,
    password: PasswordMethod,
    createdAt: Date,
  ): Promise<boolean> {
    const at = instantOf(createdAt);
    const isOurs = this.db
      .selectFrom("accounts")
      .select("id")
      .where("id", "=", account.id);
    const [created] = await this.batch.write([
      this.db
        .insertInto("accounts")
        .columns(["id", "name", "name_key", "role", "created_at"])
        .expression(
          this.db
            .selectNoFrom((eb) => [
              eb.val(account.id).as("id"),
              eb.val(account.name).as("name"),
              eb.val(nameKeyOf(account.name)).as("name_key"),
              eb.val(account.role).as("role"),
              eb.val(at).as("created_at"),
            ])
            .where((eb) =>
              eb.not(eb.exists(eb.selectFrom("accounts").select("id"))),
            ),
        ),
      this.db
        .insertInto("sign_in_methods")
        .columns(["id", "account_id", "kind", "created_at"])
        .expression(
          this.db
            .selectNoFrom((eb) => [
              eb.val(password.id).as("id"),
              eb.val(account.id).as("account_id"),
              eb.val("password").as("kind"),
              eb.val(at).as("created_at"),
            ])
            .where((eb) => eb.exists(isOurs)),
        ),
      this.db
        .insertInto("password_methods")
        .columns([
          "method_id",
          "salt",
          "iterations",
          "verifier",
          "wrapped_data_key",
        ])
        .expression(
          this.db
            .selectNoFrom((eb) => [
              eb.val(password.id).as("method_id"),
              eb.val(password.salt).as("salt"),
              eb.val(password.iterations).as("iterations"),
              eb.val(password.verifier).as("verifier"),
              eb.val(password.wrappedDataKey).as("wrapped_data_key"),
            ])
            .where((eb) => eb.exists(isOurs)),
        ),
    ]);
    return (created?.affectedRows ?? 0) > 0;
  }

  async withPassword(
    nameKey: string,
  ): Promise<{ account: Account; password: PasswordMethod } | null> {
    const row = await this.db
      .selectFrom("accounts")
      .innerJoin("sign_in_methods", "sign_in_methods.account_id", "accounts.id")
      .innerJoin(
        "password_methods",
        "password_methods.method_id",
        "sign_in_methods.id",
      )
      .select([
        "accounts.id as account_id",
        "accounts.name",
        "accounts.role",
        "password_methods.method_id",
        "password_methods.salt",
        "password_methods.iterations",
        "password_methods.verifier",
        "password_methods.wrapped_data_key",
      ])
      .where("accounts.name_key", "=", nameKey)
      .executeTakeFirst();
    if (!row) return null;
    return {
      account: { id: row.account_id, name: row.name, role: row.role },
      password: {
        id: row.method_id,
        salt: row.salt,
        iterations: row.iterations,
        verifier: row.verifier,
        wrappedDataKey: row.wrapped_data_key,
      },
    };
  }

  async get(id: string): Promise<Account | null> {
    const row = await this.db
      .selectFrom("accounts")
      .select(["id", "name", "role"])
      .where("id", "=", id)
      .executeTakeFirst();
    return row ?? null;
  }
}
