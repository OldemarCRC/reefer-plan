import type { DefaultSession, DefaultUser } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

type UserRole = 'ADMIN' | 'SHIPPING_PLANNER' | 'STEVEDORE' | 'CHECKER' | 'EXPORTER' | 'VIEWER';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: UserRole;
      shipperCode?: string | null;
      sessionVersion?: number;
    };
  }

  interface User extends DefaultUser {
    role: UserRole;
    shipperCode?: string | null;
    sessionVersion?: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    role?: UserRole;
    shipperCode?: string | null;
    sessionVersion?: number;
  }
}
