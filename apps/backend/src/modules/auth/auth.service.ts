import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import {
  ERROR_CODES,
  type AuthSession,
  type AuthUser,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@muso/shared';
import { Prisma } from '@muso/database';
import { PrismaService } from '../../database/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { MailService } from '../mail/mail.service.js';
import { AuthCodesService } from './auth-codes.service.js';
import { TokensService, type ClientMeta } from './tokens.service.js';

const userSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  username: true,
  displayName: true,
  avatarKey: true,
  onboardedAt: true,
  roles: { select: { role: true } },
} as const;
type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** Precomputed hash so sign-in for unknown emails costs the same as for real ones. */
const DUMMY_HASH_PROMISE = hash('timing-equaliser-not-a-real-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly codes: AuthCodesService,
    private readonly mail: MailService,
    private readonly storage: StorageService,
  ) {}

  async signUp(input: SignUpInput, meta: ClientMeta): Promise<AuthSession> {
    const passwordHash = await hash(input.password);
    let user: SelectedUser;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          // Everyone can discover, watch and support. Other roles are chosen in onboarding.
          roles: { create: { role: 'SUPPORTER' } },
        },
        select: userSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException({
          code: ERROR_CODES.CONFLICT,
          message: 'An account with this email already exists',
        });
      }
      throw err;
    }

    await this.sendVerificationCode(user.id, user.email);
    const tokens = await this.tokens.issue(user.id, meta);
    return { user: this.toAuthUser(user), tokens };
  }

  async signIn(input: SignInInput, meta: ClientMeta): Promise<AuthSession> {
    const user = await this.prisma.user.findFirst({
      where: { email: input.email, deletedAt: null },
      select: { ...userSelect, passwordHash: true },
    });

    const valid = user?.passwordHash
      ? await verify(user.passwordHash, input.password)
      : await verify(await DUMMY_HASH_PROMISE, input.password).then(() => false);

    if (!user || !valid) {
      throw new UnauthorizedException({
        code: ERROR_CODES.UNAUTHENTICATED,
        message: 'Incorrect email or password',
      });
    }

    const tokens = await this.tokens.issue(user.id, meta);
    return { user: this.toAuthUser(user), tokens };
  }

  async refresh(refreshToken: string, meta: ClientMeta): Promise<AuthSession> {
    const { userId, tokens } = await this.tokens.rotate(refreshToken, meta);
    return { user: await this.me(userId), tokens };
  }

  async signOut(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: userSelect,
    });
    return this.toAuthUser(user);
  }

  async verifyEmail(userId: string, code: string): Promise<AuthUser> {
    await this.codes.consume(userId, 'EMAIL_VERIFICATION', code);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
      select: userSelect,
    });
    return this.toAuthUser(user);
  }

  async resendVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return;
    await this.sendVerificationCode(userId, user.email);
  }

  /** Always succeeds from the caller's view, so it can't be used to discover accounts. */
  async forgotPassword({ email }: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) return;
    const code = await this.codes.create(user.id, 'PASSWORD_RESET');
    await this.mail.send({
      to: user.email,
      subject: 'Reset your MUSO password',
      text: `Your password reset code is ${code}. It expires in 15 minutes. If you didn't ask for this, ignore this email.`,
    });
  }

  /** Resets the password and signs out every device. */
  async resetPassword({ email, code, newPassword }: ResetPasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      // Same error as a wrong code: don't reveal whether the email exists.
      throw this.codes.invalidError();
    }
    await this.codes.consume(user.id, 'PASSWORD_RESET', code);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hash(newPassword), emailVerifiedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(user.id);
  }

  private async sendVerificationCode(userId: string, email: string): Promise<void> {
    const code = await this.codes.create(userId, 'EMAIL_VERIFICATION');
    await this.mail.send({
      to: email,
      subject: 'Verify your MUSO email',
      text: `Your verification code is ${code}. It expires in 15 minutes.`,
    });
  }

  toAuthUser(u: SelectedUser): AuthUser {
    return {
      id: u.id,
      email: u.email,
      emailVerified: u.emailVerifiedAt !== null,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: this.storage.publicUrl(u.avatarKey),
      roles: u.roles.map((r) => r.role),
      onboarded: u.onboardedAt !== null,
    };
  }
}
