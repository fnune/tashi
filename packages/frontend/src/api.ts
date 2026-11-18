import type {
  AiConnectionStatus,
  ApiErrorCode,
  CalculateRequest,
  CalculateResponse,
  ChooseAiModelRequest,
  ConnectAiRequest,
  CreateTimelineRequest,
  DiaryApi,
  ErrorResponse,
  FoodVocabEntry,
  ImportEntriesRequest,
  InsulinOnBoard,
  LogMealRequest,
  LogMealResponse,
  ProblemsResponse,
  Settings,
  StartImportRequest,
  TimelineEntry,
  TimelinePageResponse,
  UpdateTimelineRequest,
  UsageSummary,
} from "@tashi/shared";
import { type ClientProblemKind, clientProblems } from "./client-problems.js";
import type { Page } from "./paging/paged-list.js";

export const BASE_PATH = new URL(document.baseURI).pathname.replace(/\/$/, "");
const BASE = BASE_PATH;

export const SIGNED_OUT_EVENT = "tashi:signed-out";

export interface SignedInAccount {
  name: string;
  role: "admin" | "member";
}

export class ApiError extends Error {
  code?: ApiErrorCode;
  lookedUp: string[];
  constructor(message: string, code?: ApiErrorCode, lookedUp: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.lookedUp = lookedUp;
  }
}

export const NO_ANSWER_MS = 15_000;
const CALCULATION_NO_ANSWER_MS = 90_000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? "GET";
  const route = path.split("?")[0] ?? path;
  const problem = (kind: ClientProblemKind, detail: string) =>
    clientProblems.record({
      at: new Date(),
      kind,
      method,
      path: route,
      detail,
    });
  const patience =
    route === "/api/calculate" ? CALCULATION_NO_ANSWER_MS : NO_ANSWER_MS;
  const unanswered = setTimeout(
    () => problem("no_answer", `no answer after ${patience / 1000} s`),
    patience,
  );

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        ...options?.headers,
      },
    });
    text = await res.text();
  } catch (error) {
    problem("network", error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    clearTimeout(unanswered);
  }

  if (!text) {
    problem("unreadable_response", `empty response with status ${res.status}`);
    throw new Error(`Empty response (${res.status}). Is the backend running?`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    problem(
      "unreadable_response",
      `status ${res.status}, not JSON: ${text.slice(0, 100)}`,
    );
    throw new Error(`Expected JSON but got: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = body as ErrorResponse;
    if (res.status >= 500) {
      problem("server_error", `${res.status} ${err.code ?? ""}: ${err.error}`);
    }
    if (err.code === "signed_out") {
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    throw new ApiError(
      err.error ?? `Request failed: ${res.status}`,
      err.code,
      err.looked_up,
    );
  }

  return body as T;
}

export function getSettings(): Promise<Settings> {
  return request<Settings>("/api/settings");
}

export function saveSettings(settings: Settings): Promise<Settings> {
  return request<Settings>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export function calculate(req: CalculateRequest): Promise<CalculateResponse> {
  return request<CalculateResponse>("/api/calculate", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function logMeal(req: LogMealRequest): Promise<LogMealResponse> {
  return request<LogMealResponse>("/api/meals", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

const TIMELINE_PAGE_SIZE = 50;

export async function getTimelinePage(
  cursor: string | null,
): Promise<Page<TimelineEntry>> {
  const query = new URLSearchParams({
    limit: String(TIMELINE_PAGE_SIZE),
    ...(cursor ? { cursor } : {}),
  }).toString();
  const page = await request<TimelinePageResponse>(`/api/timeline?${query}`);
  return { items: page.entries, next: page.next_cursor };
}

export function getIob(): Promise<InsulinOnBoard> {
  return request<InsulinOnBoard>("/api/iob");
}

export function createTimelineEntry(
  req: CreateTimelineRequest,
): Promise<TimelineEntry> {
  return request<TimelineEntry>("/api/timeline", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function updateTimelineEntry(
  id: string,
  updates: UpdateTimelineRequest,
): Promise<TimelineEntry> {
  return request<TimelineEntry>(`/api/timeline/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export function deleteTimelineEntry(id: string): Promise<void> {
  return request(`/api/timeline/${id}`, { method: "DELETE" });
}

export function clearTimeline(): Promise<void> {
  return request("/api/timeline", { method: "DELETE" });
}

export function getAiConnection(): Promise<AiConnectionStatus> {
  return request<AiConnectionStatus>("/api/ai-connection");
}

export function connectAi(apiKey: string): Promise<AiConnectionStatus> {
  const body: ConnectAiRequest = { api_key: apiKey };
  return request<AiConnectionStatus>("/api/ai-connection", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function chooseAiModel(model: string): Promise<AiConnectionStatus> {
  const body: ChooseAiModelRequest = { model };
  return request<AiConnectionStatus>("/api/ai-connection/model", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function disconnectAi(): Promise<AiConnectionStatus> {
  return request<AiConnectionStatus>("/api/ai-connection", {
    method: "DELETE",
  });
}

export function getUsageSince(since: Date): Promise<UsageSummary> {
  return request<UsageSummary>(
    `/api/usage?since=${encodeURIComponent(since.toISOString())}`,
  );
}

export function getVocabulary(): Promise<FoodVocabEntry[]> {
  return request<FoodVocabEntry[]>("/api/vocabulary");
}

async function startImport(req: StartImportRequest): Promise<void> {
  await request("/api/import", { method: "POST", body: JSON.stringify(req) });
}

async function importEntries(req: ImportEntriesRequest): Promise<void> {
  await request("/api/import/entries", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export const diaryApi: DiaryApi = {
  settings: getSettings,
  vocabulary: getVocabulary,
  timelinePage: async (cursor) => {
    const page = await getTimelinePage(cursor);
    return { entries: page.items, next: page.next };
  },
  startImport,
  importEntries,
};

export function getAccount(): Promise<SignedInAccount> {
  return request<SignedInAccount>("/api/auth/me");
}

export async function signIn(name: string, password: string): Promise<void> {
  await request("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ name, password }),
  });
}

export async function setUp(name: string, password: string): Promise<void> {
  await request("/api/setup", {
    method: "POST",
    body: JSON.stringify({ name, password }),
  });
}

export async function signOut(): Promise<void> {
  await request("/api/auth/sign-out", { method: "POST" });
}

export function getProblems(signal: AbortSignal): Promise<ProblemsResponse> {
  return request<ProblemsResponse>("/api/problems", { signal });
}
