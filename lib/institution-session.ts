import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-only-fallback-secret-change-me"
);

export const INSTITUTION_SESSION_COOKIE = "netivim_institution_session";

export interface InstitutionSessionUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
}

export async function signInstitutionSession(user: InstitutionSessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyInstitutionSession(token?: string): Promise<InstitutionSessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload?.id || !payload?.organizationId) return null;
    return {
      id: Number(payload.id),
      organizationId: Number(payload.organizationId),
      name: String(payload.name || ""),
      email: String(payload.email || ""),
    };
  } catch {
    return null;
  }
}
