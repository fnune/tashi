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
  injection_in_future: "The injection time is in the future.",
  api_key_missing: "Add your Anthropic API key in settings to calculate doses.",
  api_key_invalid:
    "Anthropic rejected the API key. Check it in settings and try again.",
  api_key_storage_unavailable:
    "Saving a key needs a secret key set on the server (TASHI_SECRET_KEY).",
  signed_out: "Sign in to continue.",
  credit_exhausted:
    "The Anthropic credit has run out. Add credit at console.anthropic.com, under Billing, then calculate again.",
  sign_in_failed: "That name and password do not match.",
  sign_in_throttled: "Too many attempts. Wait a moment and try again.",
  password_too_short: "The password needs at least 8 characters.",
  validation_failed: "Invalid request.",
  not_found: "Not found.",
  internal_error: "Something went wrong.",
};

export function apiError(
  c: Context,
  code: ApiErrorCode,
  status: 400 | 401 | 404 | 429 | 500,
  detail?: string,
) {
  const body: ErrorResponse = {
    error: detail ?? FALLBACK_MESSAGES[code],
    code,
  };
  return c.json(body, status);
}
