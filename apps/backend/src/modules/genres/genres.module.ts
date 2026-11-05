import { Module } from '@nestjs/common';
import { GenresController } from './genres.controller.js';

@Module({ controllers: [GenresController] })
export class GenresModule {}
