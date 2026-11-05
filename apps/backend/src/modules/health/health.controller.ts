import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import type { Health } from '@muso/shared';
import type { Response } from 'express';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** 200 when the database is reachable, 503 otherwise (Redis is non-critical in M1). */
  @Get()
  @ApiOkResponse({ description: 'Service health and dependency status' })
  async check(@Res({ passthrough: true }) res: Response): Promise<Health> {
    const result = await this.health.check();
    if (result.services.database === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
