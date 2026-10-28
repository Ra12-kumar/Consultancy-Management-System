import argon2 from 'argon2';

// Argon2id with OWASP-recommended cost (19 MiB, 2 iterations).
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);

export async function verifyPassword(hash: string | null | undefined, password: string) {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

// Used when the account does not exist, so a failed login takes about as long either way.
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hashPassword('dummy-password-for-timing-1');
  await verifyPassword(await dummyHash, password);
}
