import { createHash, timingSafeEqual } from "node:crypto";
import { basicAuth } from "hono/basic-auth";

const fixedLengthDigest = (value: string) =>
  createHash("sha256").update(value).digest();

export function passwordGate(password: string) {
  const expected = fixedLengthDigest(password);
  return basicAuth({
    verifyUser: (_username, candidate) =>
      timingSafeEqual(fixedLengthDigest(candidate), expected),
  });
}
