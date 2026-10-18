import type { ApiErrorCode, ErrorResponse } from "@tashi/shared";
import type { Context } from "hono";

const FALLBACK_MESSAGES: Record<ApiErrorCode, string> = {
  bolus_insulin_not_configured:
    "Choose which insulin you're using in settings before dosing.",
  basal_insulin_not_configured:
    "Choose which long-acting insulin you're using in settings first.",
  insulin_action_not_configured:
    "Choose which insulin you're using in settings to see insulin on board.",
  no_meal_window: "No meal window covers the current time",
  validation_failed: "Invalid request.",
  not_found: "Not found.",
  internal_error: "Something went wrong.",
};

export function apiError(
  c: Context,
  code: ApiErrorCode,
  status: 400 | 404 | 500,
  detail?: string,
) {
  const body: ErrorResponse = {
    error: detail ?? FALLBACK_MESSAGES[code],
    code,
  };
  return c.json(body, status);
}
