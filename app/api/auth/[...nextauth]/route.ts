import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import sql from "@/lib/db";

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
      // Check if user email exists in our users table
      const rows = await sql`SELECT id FROM users WHERE email = ${user.email} AND status = 'active' LIMIT 1`;
      if (!rows.length) {
        // Email not found — block login
        return "/login?error=not_authorized";
      }
      return true;
    },
    async session({ session }) {
      if (session?.user?.email) {
        // Attach our DB user data to the session
        const rows = await sql`SELECT id, name, email, role, status, area FROM users WHERE email = ${session.user.email} LIMIT 1`;
        if (rows.length) {
          (session.user as any).id = rows[0].id;
          (session.user as any).role = rows[0].role;
          (session.user as any).area = rows[0].area;
          (session.user as any).dbName = rows[0].name;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      return token;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});

export { handler as GET, handler as POST };
