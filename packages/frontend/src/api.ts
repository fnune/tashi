import type {
  CalculateRequest,
  CalculateResponse,
  CalculationResult,
  ErrorResponse,
  Settings,
} from "@t1d-aid/shared";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = (await res.json()) as ErrorResponse;
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
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
