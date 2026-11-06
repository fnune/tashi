import type { ServerProblem } from "@tashi/shared";
import type { ClientProblem } from "./client-problems.js";

export const ISSUES_URL = "https://github.com/fnune/tashi/issues/new";
export const MAX_ISSUE_URL_LENGTH = 7500;
const LINES_IN_LINK = 10;

export type ServerProblems =
  | { kind: "listed"; problems: ServerProblem[] }
  | { kind: "unavailable"; reason: string };

export interface ReportInput {
  commit: string;
  userAgent: string;
  reportedAt: Date;
  server: ServerProblems;
  client: ClientProblem[];
}

export interface ProblemReport {
  title: string;
  body: string;
}

export function problemReport(
  input: ReportInput,
  linesPerList = Number.POSITIVE_INFINITY,
): ProblemReport {
  return {
    title: titleOf(input),
    body: [
      "### What happened",
      "",
      "Describe what you were doing and what you expected to see.",
      "",
      "### Details",
      "",
      `- Tashi: ${input.commit}`,
      `- Browser: ${input.userAgent}`,
      `- Reported: ${input.reportedAt.toISOString()}`,
      "",
      "### Problems the server recorded",
      "",
      ...serverSection(input.server, linesPerList),
      "",
      "### Problems in this browser",
      "",
      ...listed(input.client.map(clientLine), linesPerList),
    ].join("\n"),
  };
}

export function issueUrl(input: ReportInput): string {
  const { title, body } = problemReport(input, LINES_IN_LINK);
  const url = `${ISSUES_URL}?${new URLSearchParams({ title, body })}`;
  if (url.length <= MAX_ISSUE_URL_LENGTH) return url;
  const shortened = `${body.slice(0, 2000)}\n\n(Shortened to fit a link. Copy the report for the whole of it.)`;
  return `${ISSUES_URL}?${new URLSearchParams({ title, body: shortened })}`;
}

function titleOf({ server, client }: ReportInput): string {
  const first =
    (server.kind === "listed" ? server.problems[0]?.error : undefined) ??
    client[0]?.kind;
  return first ? `Problem report: ${first}` : "Problem report";
}

function serverSection(server: ServerProblems, lines: number): string[] {
  if (server.kind === "unavailable") {
    return [`Not available: ${server.reason}`];
  }
  return listed(server.problems.map(serverLine), lines);
}

function listed(lines: string[], limit: number): string[] {
  if (lines.length === 0) return ["None recorded."];
  const shown = lines.slice(0, limit);
  const left = lines.length - shown.length;
  return ["```", ...shown, ...(left > 0 ? [`… and ${left} older`] : []), "```"];
}

function serverLine(problem: ServerProblem): string {
  const cause = problem.cause ? ` (cause: ${problem.cause})` : "";
  return `${problem.occurred_at} ${problem.method} ${problem.path}: ${problem.error}: ${problem.message}${cause}`;
}

function clientLine(problem: ClientProblem): string {
  const request = problem.method
    ? ` ${problem.method} ${problem.path ?? ""}`
    : "";
  return `${problem.at.toISOString()} ${problem.kind}${request}: ${problem.detail}`;
}
