import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

// Deliberately minimal: this app has ~3 family users on a handful of
// devices, all sharing one dataset. No roles, no per-user data scoping —
// just enough login to keep the family map off the open internet.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Credentials({
      id: "magic-link",
      credentials: { token: {} },
      authorize: async (credentials) => {
        const token = credentials?.token as string | undefined;
        if (!token) return null;

        const record = await prisma.loginToken.findUnique({ where: { token }, include: { user: true } });
        if (!record || record.usedAt || record.expiresAt < new Date()) return null;

        // Single-use: consume it before returning success.
        await prisma.loginToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });

        return { id: record.user.id, email: record.user.email, name: record.user.name };
      },
    }),
  ],
});
