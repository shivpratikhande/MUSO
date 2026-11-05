import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@muso/shared';

export const ROLES_KEY = 'roles';

/** Require the caller to hold at least one of the listed roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
