import type { UserRole } from '@muso/shared';

/** Authenticated principal attached to `request.user`. */
export interface RequestUser {
  id: string;
  email: string;
  roles: UserRole[];
  emailVerified: boolean;
}

export interface AccessTokenPayload {
  sub: string;
  typ: 'access';
}
