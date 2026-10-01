import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1)
const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, opts);
export const verifyPassword = async (hashed: string, plain: string) => {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
};

/** Minimum policy: 10+ chars with letters and digits. */
export function passwordProblems(p: string): string | null {
  if (p.length < 10) return "PASSWORD_TOO_SHORT";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "PASSWORD_TOO_WEAK";
  return null;
}
