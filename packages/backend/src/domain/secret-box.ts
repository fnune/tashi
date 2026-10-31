export interface SealedSecret {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const TAG_BYTES = 16;
const text = new TextEncoder();

export async function seal(
  secret: string,
  secretKey: string,
): Promise<SealedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await deriveKey(secretKey, salt),
      text.encode(secret),
    ),
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    tag: toBase64(encrypted.subarray(-TAG_BYTES)),
    data: toBase64(encrypted.subarray(0, -TAG_BYTES)),
  };
}

export async function unseal(
  sealed: SealedSecret,
  secretKey: string,
): Promise<string | null> {
  try {
    const ciphertext = new Uint8Array([
      ...fromBase64(sealed.data),
      ...fromBase64(sealed.tag),
    ]);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv) },
      await deriveKey(secretKey, fromBase64(sealed.salt)),
      ciphertext,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

async function deriveKey(
  secretKey: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    text.encode(secretKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: text.encode("tashi api key") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

export function fromBase64(encoded: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}
