import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Lazy import sql to avoid build-time DB connection
async function getUserByEmail(email: string) {
  try {
    const { default: sql } = await import("@/lib/db");
    const rows = await sql`SELECT id, name, email, role, area FROM users WHERE email = ${email} AND status = 'active' LIMIT 1`;
    return rows[0] || null;
  } catch (e) {
    console.error("DB error in NextAuth:", e);
    return null;
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      const dbUser = await getUserByEmail(user.email);
      return dbUser !== null;
    },
    // Enrich the JWT at sign-in so middleware can read the role
    // without a DB round-trip on every request.
    async jwt({ token, user, trigger }) {
      if (user?.email || trigger === "signIn" || !token.role) {
        const email = (user?.email || token.email) as string | undefined;
        if (email) {
          const dbUser = await getUserByEmail(email);
          if (dbUser) {
            (token as any).id = dbUser.id;
            (token as any).role = dbUser.role;
            (token as any).area = dbUser.area;
            (token as any).dbName = dbUser.name;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).area = (token as any).area;
        (session.user as any).dbName = (token as any).dbName;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: false,
  logger: {
    error: () => {},
    warn: () => {},
    debug: () => {},
  },
});

export { handler as GET, handler as POST };
