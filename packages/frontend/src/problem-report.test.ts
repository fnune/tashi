import type { ServerProblem } from "@tashi/shared";
import { describe, expect, it } from "vitest";
import { CLIENT_PROBLEMS_KEPT, ClientProblemLog } from "./client-problems.js";
import {
  ISSUES_URL,
  issueUrl,
  MAX_ISSUE_URL_LENGTH,
  problemReport,
  type ReportInput,
} from "./problem-report.js";

const timedOut: ServerProblem = {
  occurred_at: "2026-11-06T20:00:00.000Z",
  method: "POST",
  path: "/api/auth/sign-in",
  error: "D1QueryTimeoutError",
  message: "D1 did not answer within 10000 ms: select failures",
  cause: null,
};

const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  commit: "37e1785",
  userAgent: "Firefox/115",
  reportedAt: new Date("2026-11-06T20:05:00.000Z"),
  server: { kind: "listed", problems: [timedOut] },
  client: [
    {
      at: new Date("2026-11-06T20:00:15.000Z"),
      kind: "no_answer",
      method: "POST",
      path: "/api/auth/sign-in",
      detail: "no answer after 15 s",
    },
  ],
  ...overrides,
});

describe("problem report", () => {
  it("names the first problem in the title and lists both sides", () => {
    const { title, body } = problemReport(input());
    expect(title).toBe("Problem report: D1QueryTimeoutError");
    expect(body).toContain("- Tashi: 37e1785");
    expect(body).toContain(
      "2026-11-06T20:00:00.000Z POST /api/auth/sign-in: D1QueryTimeoutError: D1 did not answer within 10000 ms: select failures",
    );
    expect(body).toContain(
      "2026-11-06T20:00:15.000Z no_answer POST /api/auth/sign-in: no answer after 15 s",
    );
  });

  it("says why the server's list is missing, such as no admin being signed in", () => {
    const { body } = problemReport(
      input({
        server: { kind: "unavailable", reason: "Sign in to continue." },
      }),
    );
    expect(body).toContain("Not available: Sign in to continue.");
  });

  it("says when nothing was recorded", () => {
    const { title, body } = problemReport(
      input({ server: { kind: "listed", problems: [] }, client: [] }),
    );
    expect(title).toBe("Problem report");
    expect(body.match(/None recorded\./g)).toHaveLength(2);
  });

  it("opens a GitHub issue that fits in a link, however many problems there are", () => {
    const many = Array.from({ length: 50 }, () => ({
      ...timedOut,
      message: "m".repeat(500),
    }));
    const url = issueUrl(input({ server: { kind: "listed", problems: many } }));
    expect(url.startsWith(`${ISSUES_URL}?`)).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_LENGTH);
  });
});

describe("client problem log", () => {
  it("keeps the newest problems first and drops the oldest", () => {
    const log = new ClientProblemLog();
    for (let n = 0; n < CLIENT_PROBLEMS_KEPT + 2; n++) {
      log.record({
        at: new Date(n * 1000),
        kind: "network",
        method: "GET",
        path: "/api/settings",
        detail: `failure ${n}`,
      });
    }
    const listed = log.list();
    expect(listed).toHaveLength(CLIENT_PROBLEMS_KEPT);
    expect(listed[0]?.detail).toBe(`failure ${CLIENT_PROBLEMS_KEPT + 1}`);
  });
});
