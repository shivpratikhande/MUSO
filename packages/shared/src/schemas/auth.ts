import { z } from 'zod';
import { UserRoleSchema } from '../enums.js';

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** NIST-style: length over composition rules. */
export const PasswordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

export const OtpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const SignUpSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(1).max(60).optional(),
});
export type SignUpInput = z.infer<typeof SignUpSchema>;

export const SignInSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type SignInInput = z.infer<typeof SignInSchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const VerifyEmailSchema = z.object({ code: OtpCodeSchema });
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ForgotPasswordSchema = z.object({ email: EmailSchema });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  email: EmailSchema,
  code: OtpCodeSchema,
  newPassword: PasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const AuthUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  emailVerified: z.boolean(),
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  roles: z.array(UserRoleSchema),
  onboarded: z.boolean(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export interface AuthTokens {
  accessToken: string;
  /** ISO timestamp. */
  accessTokenExpiresAt: string;
  refreshToken: string;
}

export interface AuthSession {
  user: AuthUser;
  tokens: AuthTokens;
}
