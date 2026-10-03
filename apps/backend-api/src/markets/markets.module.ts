import { Module } from '@nestjs/common';
import { MarketsController } from './markets.controller';

@Module({ controllers: [MarketsController] })
export class MarketsModule {}
