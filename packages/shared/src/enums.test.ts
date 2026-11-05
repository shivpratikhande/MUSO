import { describe, expect, it } from 'vitest';
import { CursorQuerySchema, SELF_ASSIGNABLE_ROLES, UserRoleSchema } from './index.js';

describe('shared schemas', () => {
  it('never lets users self-assign ADMIN', () => {
    expect(SELF_ASSIGNABLE_ROLES).not.toContain('ADMIN');
  });

  it('rejects unknown roles', () => {
    expect(UserRoleSchema.safeParse('HACKER').success).toBe(false);
  });

  it('defaults and clamps pagination', () => {
    expect(CursorQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(CursorQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(CursorQuerySchema.parse({ limit: '5' }).limit).toBe(5);
  });
});

import { SignUpSchema, ResetPasswordSchema } from './index.js';

describe('auth schemas', () => {
  it('normalises email to lowercase and trims', () => {
    const r = SignUpSchema.parse({ email: '  Ana@Example.COM ', password: 'longenough1' });
    expect(r.email).toBe('ana@example.com');
  });

  it('rejects short passwords', () => {
    expect(SignUpSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('requires a 6-digit reset code', () => {
    const base = { email: 'a@b.co', newPassword: 'longenough1' };
    expect(ResetPasswordSchema.safeParse({ ...base, code: '12345' }).success).toBe(false);
    expect(ResetPasswordSchema.safeParse({ ...base, code: '123456' }).success).toBe(true);
  });
});
