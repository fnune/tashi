import type {
  ApiErrorCode,
  ApiKeyStatus,
  CalculateRequest,
  CalculateResponse,
  CreateTimelineRequest,
  ErrorResponse,
  InsulinOnBoard,
  LogMealRequest,
  LogMealResponse,
  SetApiKeyRequest,
  Settings,
  TimelineEntry,
  TimelinePageResponse,
  UpdateTimelineRequest,
} from "@tashi/shared";
import type { Page } from "./paging/paged-list.js";

declare const __BASE_PATH__: string;
const BASE = __BASE_PATH__;

export class ApiError extends Error {
  code?: ApiErrorCode;
  constructor(message: string, code?: ApiErrorCode) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...options?.headers,
    },
  });

  const text = await res.text();
  if (!text) {
    throw new Error(`Empty response (${res.status}). Is the backend running?`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but got: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const err = body as ErrorResponse;
    throw new ApiError(err.error ?? `Request failed: ${res.status}`, err.code);
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

export function getApiKeyStatus(): Promise<ApiKeyStatus> {
  return request<ApiKeyStatus>("/api/api-key");
}

export function saveApiKey(apiKey: string): Promise<ApiKeyStatus> {
  const body: SetApiKeyRequest = { api_key: apiKey };
  return request<ApiKeyStatus>("/api/api-key", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteApiKey(): Promise<ApiKeyStatus> {
  return request<ApiKeyStatus>("/api/api-key", { method: "DELETE" });
}
