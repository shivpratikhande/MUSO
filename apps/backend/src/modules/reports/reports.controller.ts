import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ReportSchema,
  ResolveReportSchema,
  type ReportDto,
  type ReportInput,
  type ResolveReportInput,
} from '@muso/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { RequestUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('reports')
  @HttpCode(HttpStatus.OK)
  create(
    @CurrentUser() u: RequestUser,
    @Body(new ZodValidationPipe(ReportSchema)) body: ReportInput,
  ): Promise<{ ok: true }> {
    return this.reports.create(body, u);
  }

  @Roles('ADMIN')
  @Get('admin/reports')
  open(): Promise<ReportDto[]> {
    return this.reports.listOpen();
  }

  @Roles('ADMIN')
  @Post('admin/reports/:id/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) id: string,
    @Body(new ZodValidationPipe(ResolveReportSchema)) body: ResolveReportInput,
  ): Promise<void> {
    await this.reports.resolve(id, body);
  }
}
