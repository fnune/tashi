import { basicAuth } from "hono/basic-auth";

const text = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", text.encode(value)),
  );
}

function equalInConstantTime(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) difference |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return difference === 0;
}

export function passwordGate(password: string) {
  const expected = digest(password);
  return basicAuth({
    verifyUser: async (_username, candidate) =>
      equalInConstantTime(await digest(candidate), await expected),
  });
}
