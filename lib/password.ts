/**
 * Password hashing using PBKDF2 via Web Crypto.
 * Chosen over bcrypt because it needs no native module and runs
 * on Netlify's serverless + edge runtimes unchanged.
 *
 * Stored format:  pbkdf2$<iterations>$<saltB64>$<hashB64>
 * Legacy plaintext passwords are still accepted on login and
 * transparently upgraded to a hash (see verifyPassword + upgradeIfLegacy).
 */

const ITERATIONS = 100_000;
const KEY_LEN = 32;
const PREFIX = "pbkdf2";

function b64(buf: ArrayBuffer): string {
  return Buffer.from(new Uint8Array(buf)).toString("base64");
}
function unb64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_LEN * 8
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derive(password, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${b64(salt.buffer as ArrayBuffer)}$${b64(bits)}`;
}

export function isHashed(stored?: string | null): boolean {
  return !!stored && stored.startsWith(PREFIX + "$");
}

/** Constant-time comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  stored?: string | null
): Promise<boolean> {
  if (!stored) return false;

  // Legacy plaintext — accept once, caller should upgrade.
  if (!isHashed(stored)) return safeEqual(password, stored);

  const [, iterStr, saltB64, hashB64] = stored.split("$");
  const iterations = parseInt(iterStr, 10) || ITERATIONS;
  const bits = await derive(password, unb64(saltB64), iterations);
  return safeEqual(b64(bits), hashB64);
}
