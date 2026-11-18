import type { ApiErrorCode, ErrorResponse } from "@tashi/shared";
import type { Context } from "hono";

const FALLBACK_MESSAGES: Record<ApiErrorCode, string> = {
  bolus_insulin_not_configured:
    "Choose which insulin you're using in settings before calculating units.",
  basal_insulin_not_configured:
    "Choose which long-acting insulin you're using in settings first.",
  insulin_action_not_configured:
    "Choose which insulin you're using in settings to see insulin on board.",
  no_meal_window: "No meal window covers the current time",
  injection_in_future: "The injection time is in the future.",
  api_key_missing: "Add your Anthropic API key in settings to calculate units.",
  api_key_invalid:
    "Anthropic rejected the API key. Check it in settings and try again.",
  signed_out: "Sign in to continue.",
  credit_exhausted:
    "The Anthropic credit has run out. Add credit at console.anthropic.com, under Billing, then calculate again.",
  sign_in_failed: "That name and password do not match.",
  sign_in_throttled: "Too many attempts. Wait a moment and try again.",
  password_too_short: "The password needs at least 8 characters.",
  calculation_unfinished:
    "Tashi couldn't finish this calculation. Nothing is wrong with your description; calculate again.",
  ai_busy: "Anthropic is busy right now. Calculate again in a minute.",
  ai_unreachable:
    "Tashi couldn't reach Anthropic. Calculate again in a moment.",
  ai_declined:
    "Anthropic declined to answer this calculation. Calculating again may work; if it keeps happening, try another model in settings.",
  validation_failed: "Invalid request.",
  not_found: "Not found.",
  internal_error: "Something went wrong.",
};

export type ErrorStatus = 400 | 401 | 404 | 422 | 429 | 500 | 503;

export function errorBody(
  code: ApiErrorCode,
  detail?: string,
  lookedUp?: string[],
): ErrorResponse {
  return {
    error: detail ?? FALLBACK_MESSAGES[code],
    code,
    ...(lookedUp?.length ? { looked_up: lookedUp } : {}),
  };
}

export function apiError(
  c: Context,
  code: ApiErrorCode,
  status: ErrorStatus,
  detail?: string,
  lookedUp?: string[],
) {
  return c.json(errorBody(code, detail, lookedUp), status);
}
