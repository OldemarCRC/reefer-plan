// auth.ts — Full NextAuth configuration
// Server-side only (uses Mongoose + bcryptjs)

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import authConfig from './auth.config';
import connectDB from './lib/db/connect';
import { UserModel } from './lib/db/schemas';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        try {
          await connectDB();

          // Select passwordHash explicitly (field uses select: false)
          const user = await UserModel
            .findOne({ email: email.toLowerCase().trim() })
            .select('+passwordHash')
            .lean();

          if (!user) return null;

          const hash = (user as any).passwordHash as string | undefined;
          if (!hash) return null;

          const valid = await bcrypt.compare(password, hash);
          if (!valid) return null;

          // Increment sessionVersion — invalidates any previous session for this user
          const updated = await UserModel.findByIdAndUpdate(
            (user as any)._id,
            { $inc: { sessionVersion: 1 }, lastLogin: new Date() },
            { new: true }
          ).select('sessionVersion').lean();

          const sessionVersion = (updated as any)?.sessionVersion ?? 1;

          return {
            id: String((user as any)._id),
            email: (user as any).email as string,
            name: (user as any).name as string,
            role: (user as any).role,
            shipperCode: (user as any).shipperCode ?? null,
            shipperId: (user as any).shipperId?.toString() ?? null,
            sessionVersion,
          } as any;
        } catch (err) {
          console.error('[auth] authorize error:', err);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    ...authConfig.callbacks,

    // Runs on sign-in (user is populated) and on every session refresh (user is null).
    // With updateAge:0 this fires on every authenticated request via auth().
    async jwt({ token, user }) {
      if (user) {
        // ── Sign-in: stamp all fields from the authorize() result into the token ──
        token.name           = user.name;
        token.email          = user.email;
        token.role           = (user as any).role;
        token.shipperCode    = (user as any).shipperCode ?? null;
        token.shipperId      = (user as any).shipperId ?? null;
        token.sessionVersion = (user as any).sessionVersion;
        // Record the absolute login time for the hard 8-hour limit.
        token.loginAt        = Date.now();
      } else {
        // ── Refresh: validate sessionVersion against the DB ──
        // If another device has logged in since this token was issued, the DB counter
        // will be higher than the token's value. Returning null clears the cookie
        // and the user is redirected to /login on their next request.
        try {
          await connectDB();
          const dbUser = await UserModel
            .findById(token.sub)
            .select('sessionVersion')
            .lean();

          if (!dbUser || (dbUser as any).sessionVersion !== token.sessionVersion) {
            return null;
          }
        } catch (err) {
          // Fail open: if the DB is momentarily unreachable, keep the session alive.
          console.error('[auth] sessionVersion check error:', err);
        }
      }

      // Hard 8-hour timeout — applies on both sign-in and refresh paths.
      const loginAt = token.loginAt as number | undefined;
      if (loginAt && Date.now() - loginAt > 28_800_000) {
        return null;
      }

      return token;
    },
  },

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,  // 8 hours — absolute cookie lifetime
    updateAge: 0,          // re-encode the JWT on every request so loginAt check runs server-side
  },

  // Derive base URL from the incoming request Host header instead of
  // NEXTAUTH_URL. Required for Docker / LAN access (192.168.x.x, custom port).
  trustHost: true,
});
