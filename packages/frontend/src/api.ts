import type {
  CalculateRequest,
  CalculateResponse,
  CreateTimelineRequest,
  Settings,
  TimelineEntry,
} from "@pincho/shared";

declare const __BASE_PATH__: string;
const BASE = __BASE_PATH__;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
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
    const err = body as { error?: string };
    throw new Error(err.error ?? `Request failed: ${res.status}`);
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

export function getTimeline(): Promise<TimelineEntry[]> {
  return request<TimelineEntry[]>("/api/timeline");
}

export function createTimelineEntry(
  req: CreateTimelineRequest,
): Promise<TimelineEntry> {
  return request<TimelineEntry>("/api/timeline", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export function deleteTimelineEntry(id: string): Promise<void> {
  return request(`/api/timeline/${id}`, { method: "DELETE" });
}

export function clearTimeline(): Promise<void> {
  return request("/api/timeline", { method: "DELETE" });
}
