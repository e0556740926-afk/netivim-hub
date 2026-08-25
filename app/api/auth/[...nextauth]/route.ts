import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import sql from "@/lib/db";

const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }: { user: any }) {
      if (!user?.email) return false;
      const rows = await sql`SELECT id FROM users WHERE email = ${user.email} AND status = 'active' LIMIT 1`;
      return rows.length > 0; // true = allow, false = block
    },
    async session({ session, token }: { session: any; token: any }) {
      if (session?.user?.email) {
        const rows = await sql`SELECT id, name, email, role, area FROM users WHERE email = ${session.user.email} LIMIT 1`;
        if (rows.length) {
          session.user.id   = rows[0].id;
          session.user.role = rows[0].role;
          session.user.area = rows[0].area;
          session.user.dbName = rows[0].name;
        }
      }
      return session;
    },
    async jwt({ token }: { token: any }) {
      return token;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
export { authOptions };
