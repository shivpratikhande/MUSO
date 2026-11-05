import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@muso/shared';
import { RolesGuard } from './roles.guard.js';

const ctx = (roles: UserRole[] | null): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        user: roles ? { id: 'u', email: 'e', emailVerified: true, roles } : undefined,
      }),
    }),
  }) as unknown as ExecutionContext;

const guardRequiring = (required: UserRole[] | undefined) => {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows any authenticated user when no roles are required', () => {
    expect(guardRequiring(undefined).canActivate(ctx(['SUPPORTER']))).toBe(true);
  });

  it('allows a user holding one of the required roles', () => {
    expect(
      guardRequiring(['ARTIST', 'ORGANIZER']).canActivate(ctx(['SUPPORTER', 'ORGANIZER'])),
    ).toBe(true);
  });

  it('rejects a user without the required role', () => {
    expect(() => guardRequiring(['ORGANIZER']).canActivate(ctx(['SUPPORTER', 'CREATOR']))).toThrow(
      ForbiddenException,
    );
  });

  it('lets ADMIN through any role check', () => {
    expect(guardRequiring(['ORGANIZER']).canActivate(ctx(['ADMIN']))).toBe(true);
  });

  it('rejects when there is no user on the request', () => {
    expect(() => guardRequiring(['ARTIST']).canActivate(ctx(null))).toThrow(ForbiddenException);
  });
});
