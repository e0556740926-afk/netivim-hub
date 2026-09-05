import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-only-fallback-secret-change-me"
);

export const ADVISEE_SESSION_COOKIE = "netivim_advisee_session";

export interface AdviseeSessionUser {
  caseId: number;
  name: string;
}

export async function signAdviseeSession(user: AdviseeSessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(SECRET);
}

export async function verifyAdviseeSession(token?: string): Promise<AdviseeSessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload?.caseId) return null;
    return { caseId: Number(payload.caseId), name: String(payload.name || "") };
  } catch {
    return null;
  }
}
