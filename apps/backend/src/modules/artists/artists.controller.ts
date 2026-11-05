import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ArtistDetail, ArtistSummary } from '@muso/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ArtistsService } from './artists.service.js';

const SearchSchema = z.object({
  q: z.string().trim().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

@ApiTags('artists')
@ApiBearerAuth()
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artists: ArtistsService) {}

  @Get()
  search(
    @Query(new ZodValidationPipe(SearchSchema)) q: z.infer<typeof SearchSchema>,
  ): Promise<ArtistSummary[]> {
    return this.artists.search(q.q, q.limit);
  }

  @Get(':id')
  get(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND })) id: string,
  ): Promise<ArtistDetail> {
    return this.artists.get(id);
  }
}
