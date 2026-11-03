import type { APIRequestContext, Page } from "@playwright/test";

export async function resetServer(
  request: APIRequestContext,
  options: { withKey?: boolean; fresh?: boolean } = {},
) {
  const query = new URLSearchParams();
  if (options.withKey === false) query.set("key", "none");
  if (options.fresh) query.set("settings", "none");
  const search = query.size > 0 ? `?${query}` : "";
  await request.post(`/api/__reset${search}`);
}

export async function atLunchtime(page: Page) {
  const lunchtime = new Date();
  lunchtime.setHours(13, 0, 0, 0);
  await page.clock.setFixedTime(lunchtime);
}

export async function goTo(page: Page, tab: string) {
  await page.getByRole("navigation").getByText(tab).click();
}
