import { randomBytes } from "./tokens.js";

const IV_BYTES = 12;
const text = new TextEncoder();

export async function sealText(
  plaintext: string,
  key: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  return seal(text.encode(plaintext), key);
}

export async function unsealText(
  sealed: Uint8Array,
  key: Uint8Array<ArrayBuffer>,
): Promise<string | null> {
  const opened = await unseal(sealed, key);
  return opened && new TextDecoder().decode(opened);
}

export function newDataKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

export async function seal(
  plaintext: Uint8Array<ArrayBuffer>,
  key: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array> {
  const iv = randomBytes(IV_BYTES);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aesKey(key),
    plaintext,
  );
  return new Uint8Array([...iv, ...new Uint8Array(sealed)]);
}

export async function unseal(
  sealed: Uint8Array,
  key: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Uint8Array.from(sealed.subarray(0, IV_BYTES)) },
      await aesKey(key),
      Uint8Array.from(sealed.subarray(IV_BYTES)),
    );
    return new Uint8Array(opened);
  } catch {
    return null;
  }
}

export async function sessionWrappingKey(
  token: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const material = await crypto.subtle.importKey("raw", token, "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new Uint8Array(0),
        info: text.encode("tashi session data key"),
      },
      material,
      256,
    ),
  );
}

function aesKey(key: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
