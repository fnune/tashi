import type { SetupToken } from "./authentication.js";
import {
  equalInConstantTime,
  randomBytes,
  sha256,
  toBase64Url,
  toHex,
} from "./tokens.js";

const text = new TextEncoder();

export function setupTokenWithHash(sha256Hex: string): SetupToken {
  return {
    accepts: async (token) =>
      equalInConstantTime(
        text.encode(toHex(await sha256(text.encode(token)))),
        text.encode(sha256Hex),
      ),
  };
}

export async function newSetupToken(): Promise<{
  token: string;
  sha256Hex: string;
}> {
  const token = toBase64Url(randomBytes(32));
  return { token, sha256Hex: toHex(await sha256(text.encode(token))) };
}
