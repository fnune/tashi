export type ClientProblemKind =
  | "no_answer"
  | "network"
  | "server_error"
  | "unreadable_response"
  | "crash";

export interface ClientProblem {
  at: Date;
  kind: ClientProblemKind;
  method: string | null;
  path: string | null;
  detail: string;
}

export const CLIENT_PROBLEMS_KEPT = 20;

export class ClientProblemLog {
  private problems: ClientProblem[] = [];

  record(problem: ClientProblem): void {
    this.problems = [problem, ...this.problems].slice(0, CLIENT_PROBLEMS_KEPT);
  }

  list(): ClientProblem[] {
    return [...this.problems];
  }
}

export const clientProblems = new ClientProblemLog();
