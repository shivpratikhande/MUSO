import { Controller, Get, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ArkivProofDto } from '@muso/shared';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ArkivService } from './arkiv.service.js';

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

@ApiTags('arkiv')
@ApiBearerAuth()
@Controller()
export class ArkivController {
  constructor(private readonly arkiv: ArkivService) {}

  /** The pool's public attention report, read live from Arkiv. */
  @Get('reward-pools/:id/arkiv')
  proof(@Param('id', uuid) id: string, @CurrentUser() u: RequestUser): Promise<ArkivProofDto> {
    return this.arkiv.proof(id, u);
  }
}
