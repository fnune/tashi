import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TemporaryDatabase {
  url: string;
  stop(): void;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

function postgresTool(name: string): string {
  const bin = process.env.PG_BIN;
  return bin ? join(bin, name) : name;
}

export async function temporaryDatabase(): Promise<TemporaryDatabase> {
  const given = process.env.TASHI_TEST_DATABASE_URL;
  if (given) return { url: given, stop() {} };

  const data = mkdtempSync(join(tmpdir(), "tashi-e2e-pg-"));
  const sockets = mkdtempSync("/tmp/tpg-");
  const port = await freePort();
  const quiet = { stdio: "ignore" } as const;
  try {
    execFileSync(
      postgresTool("initdb"),
      ["-D", data, "-U", "tashi", "--auth=trust"],
      quiet,
    );
    execFileSync(
      postgresTool("pg_ctl"),
      [
        "-D",
        data,
        "-o",
        `-p ${port} -k ${sockets} -c listen_addresses=127.0.0.1 -c fsync=off`,
        "-l",
        join(data, "log"),
        "-w",
        "start",
      ],
      quiet,
    );
    execFileSync(
      postgresTool("createdb"),
      ["-h", "127.0.0.1", "-p", String(port), "-U", "tashi", "tashi_e2e"],
      quiet,
    );
  } catch (error) {
    rmSync(data, { recursive: true, force: true });
    rmSync(sockets, { recursive: true, force: true });
    throw new Error(
      `Could not start a temporary Postgres (initdb and pg_ctl must be on PATH or in PG_BIN, or set TASHI_TEST_DATABASE_URL): ${error}`,
    );
  }

  return {
    url: `postgres://tashi@127.0.0.1:${port}/tashi_e2e`,
    stop() {
      try {
        execFileSync(
          postgresTool("pg_ctl"),
          ["-D", data, "-m", "immediate", "stop"],
          quiet,
        );
      } finally {
        rmSync(data, { recursive: true, force: true });
        rmSync(sockets, { recursive: true, force: true });
      }
    },
  };
}
