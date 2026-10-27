import { z } from "zod";
import type { TimelineCursor } from "../domain/repositories.js";

const cursorSchema = z.object({
  occurredAt: z.string().datetime(),
  id: z.string().uuid(),
});

export function encodeCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(text: string): TimelineCursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(text, "base64url").toString("utf-8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
