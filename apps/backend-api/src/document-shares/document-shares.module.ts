import { Module } from '@nestjs/common';
import { DocumentSharesController, WorkerDocumentSharesController } from './document-shares.controller';
import { DocumentSharesService } from './document-shares.service';

@Module({
  controllers: [WorkerDocumentSharesController, DocumentSharesController],
  providers: [DocumentSharesService],
})
export class DocumentSharesModule {}
