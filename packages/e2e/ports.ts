// Each Playwright worker gets its own pair of servers, so tests that reset
// the server never share one.
export const E2E_WORKERS = Number(process.env.E2E_WORKERS ?? 4);

export function portsOf(slot: number): { open: number; gated: number } {
  return { open: 3100 + 2 * slot, gated: 3101 + 2 * slot };
}

export const SLOTS = Array.from({ length: E2E_WORKERS }, (_, slot) => slot);
