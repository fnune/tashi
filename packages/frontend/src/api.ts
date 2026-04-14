import type {
  CalculateRequest,
  CalculateResponse,
  CalculationResult,
  Settings,
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

export async function calculate(
  req: CalculateRequest,
): Promise<CalculationResult> {
  const res = await request<CalculateResponse>("/api/calculate", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return res.result;
}

export function getHistory(): Promise<CalculationResult[]> {
  return request<CalculationResult[]>("/api/history");
}

export function deleteHistoryEntry(id: string): Promise<void> {
  return request(`/api/history/${id}`, { method: "DELETE" });
}

export function clearHistory(): Promise<void> {
  return request("/api/history", { method: "DELETE" });
}
