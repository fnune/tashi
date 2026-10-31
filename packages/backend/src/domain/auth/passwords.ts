export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
export const PASSWORD_SALT_BYTES = 16;

export interface PasswordKeys {
  verifier: Uint8Array<ArrayBuffer>;
  keyEncryptionKey: Uint8Array<ArrayBuffer>;
}

export async function passwordKeys(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<PasswordKeys> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      512,
    ),
  );
  return { verifier: bits.slice(0, 32), keyEncryptionKey: bits.slice(32) };
}
