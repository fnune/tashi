import type { APIRequestContext, Page } from "@playwright/test";

export const SERVER = "http://localhost:3100";
export const GATED_SERVER = "http://localhost:3101";

export async function resetServer(
  request: APIRequestContext,
  options: { withKey?: boolean } = {},
) {
  const withoutKey = options.withKey === false ? "?key=none" : "";
  await request.post(`${SERVER}/api/__reset${withoutKey}`);
}

export async function atLunchtime(page: Page) {
  const lunchtime = new Date();
  lunchtime.setHours(13, 0, 0, 0);
  await page.clock.setFixedTime(lunchtime);
}

export async function goTo(page: Page, tab: string) {
  await page.getByRole("navigation").getByText(tab).click();
}
