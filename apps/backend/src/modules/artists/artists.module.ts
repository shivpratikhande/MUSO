import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { ArtistsController } from './artists.controller.js';
import { ArtistsService } from './artists.service.js';

@Module({ imports: [EventsModule], controllers: [ArtistsController], providers: [ArtistsService] })
export class ArtistsModule {}
