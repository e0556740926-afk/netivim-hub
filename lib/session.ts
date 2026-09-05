import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "dev-only-fallback-secret-change-me"
);

export const SESSION_COOKIE = "netivim_session";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: string;
  area?: string;
  team?: string; // 'advisors' | 'field' | undefined (undefined = full access / chief admin)
  isCeo?: boolean;
}

/** Strip everything that must never leave the server (password, tokens). */
export function toSessionUser(row: any): SessionUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    area: row.area || "",
    team: row.team || undefined,
    isCeo: !!row.is_ceo,
  };
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifySession(token?: string): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (!payload?.email) return null;
    return {
      id: Number(payload.id),
      name: String(payload.name || ""),
      email: String(payload.email),
      role: String(payload.role || "coordinator"),
      area: String(payload.area || ""),
    };
  } catch {
    return null;
  }
}
