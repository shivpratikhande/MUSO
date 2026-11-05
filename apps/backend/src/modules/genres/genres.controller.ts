import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Genre } from '@muso/shared';
import { PrismaService } from '../../database/prisma.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@ApiTags('genres')
@Controller('genres')
export class GenresController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  list(): Promise<Genre[]> {
    return this.prisma.genre.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
