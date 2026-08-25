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
    async session({ session }) {
      if (session?.user?.email) {
        const dbUser = await getUserByEmail(session.user.email);
        if (dbUser) {
          (session.user as any).id = dbUser.id;
          (session.user as any).role = dbUser.role;
          (session.user as any).area = dbUser.area;
          (session.user as any).dbName = dbUser.name;
        }
      }
      return session;
    },
    async jwt({ token }) {
      return token;
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
