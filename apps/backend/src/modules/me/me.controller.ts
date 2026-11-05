import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ArtistProfileInputSchema,
  CreatorProfileInputSchema,
  OrganizerProfileInputSchema,
  SetInterestsSchema,
  SetRolesSchema,
  UpdateMeSchema,
  type ArtistProfileInput,
  type CreatorProfileInput,
  type MyProfile,
  type OrganizerProfileInput,
  type SetInterestsInput,
  type SetRolesInput,
  type UpdateMeInput,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MeService } from './me.service.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentUser() user: RequestUser): Promise<MyProfile> {
    return this.me.get(user.id);
  }

  @Patch()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(UpdateMeSchema)) body: UpdateMeInput,
  ): Promise<MyProfile> {
    return this.me.update(user.id, body);
  }

  @Put('roles')
  setRoles(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetRolesSchema)) body: SetRolesInput,
  ): Promise<MyProfile> {
    return this.me.setRoles(user.id, body.roles);
  }

  @Put('interests')
  interests(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(SetInterestsSchema)) body: SetInterestsInput,
  ): Promise<MyProfile> {
    return this.me.setInterests(user.id, body.genreIds);
  }

  @Put('artist-profile')
  artist(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(ArtistProfileInputSchema)) body: ArtistProfileInput,
  ): Promise<MyProfile> {
    return this.me.upsertArtistProfile(user.id, body);
  }

  @Put('creator-profile')
  creator(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(CreatorProfileInputSchema)) body: CreatorProfileInput,
  ): Promise<MyProfile> {
    return this.me.upsertCreatorProfile(user.id, body);
  }

  @Put('organizer-profile')
  organizer(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(OrganizerProfileInputSchema)) body: OrganizerProfileInput,
  ): Promise<MyProfile> {
    return this.me.upsertOrganizerProfile(user.id, body);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  complete(@CurrentUser() user: RequestUser): Promise<MyProfile> {
    return this.me.completeOnboarding(user.id);
  }
}
