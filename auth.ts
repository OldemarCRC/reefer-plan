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

    // Add role, name, email and sessionVersion to the JWT token on first sign-in.
    jwt({ token, user }) {
      if (user) {
        token.name           = user.name;
        token.email          = user.email;
        token.role           = (user as any).role;
        token.shipperCode    = (user as any).shipperCode ?? null;
        token.sessionVersion = (user as any).sessionVersion;
      }
      return token;
    },
  },

  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8 hours

  // Derive base URL from the incoming request Host header instead of
  // NEXTAUTH_URL. Required for Docker / LAN access (192.168.x.x, custom port).
  trustHost: true,
});
