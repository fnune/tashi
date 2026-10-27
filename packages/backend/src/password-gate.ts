import { createHash, timingSafeEqual } from "node:crypto";
import { basicAuth } from "hono/basic-auth";

const digest = (value: string) => createHash("sha256").update(value).digest();

// Hashing first gives equal-length buffers, so the comparison leaks neither content nor length.
export function passwordGate(password: string) {
  const expected = digest(password);
  return basicAuth({
    verifyUser: (_username, candidate) =>
      timingSafeEqual(digest(candidate), expected),
  });
}
