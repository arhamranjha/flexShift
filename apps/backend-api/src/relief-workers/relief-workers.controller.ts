import {
  BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { extname } from 'path';
import { ReliefWorkersService } from './relief-workers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import {
  ConciergeWorkerDto, DocumentQueueQueryDto, LookupQueryDto, UpdatePreferencesDto, UploadDocumentDto, VerifyDocumentDto, WorkerQueryDto,
} from './dto/relief-worker.dto';

const STAFF = [Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER];
const MIME: Record<string, string> = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// The type a browser reports comes from the user's OS and can be empty or wrong (some Windows machines), so the
// extension decides what is accepted here and the service then verifies the actual bytes.
const upload = FileInterceptor('file', {
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    MIME[extname(file.originalname).toLowerCase()]
      ? cb(null, true)
      : cb(new BadRequestException('Only PDF, PNG or JPEG documents are accepted'), false),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('relief-workers')
export class ReliefWorkersController {
  constructor(private workersService: ReliefWorkersService) {}

  @Get()
  @Roles(...STAFF)
  findAll(@CurrentUser() user: any, @Query() query: WorkerQueryDto) {
    return this.workersService.findAll(user, query);
  }

  @Get('lookup')
  @Roles(...STAFF)
  lookup(@Query() query: LookupQueryDto) {
    return this.workersService.lookup(query.registrationNumber);
  }

  /** Compliance review desk queue. Declared before ':id' routes. */
  @Get('documents/queue')
  @Roles(...STAFF)
  documentQueue(@CurrentUser() user: any, @Query() query: DocumentQueueQueryDto) {
    return this.workersService.documentQueue(user, query);
  }

  @Get('documents/:docId/file')
  async downloadDocument(@CurrentUser() user: any, @Param('docId', ParseUUIDPipe) docId: string, @Res() res: Response) {
    const { buffer, filename } = await this.workersService.downloadDocument(user, docId);
    res.setHeader('Content-Type', MIME[extname(filename)] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }

  @Patch('documents/:docId/verify')
  @Roles(...STAFF)
  verifyDocument(@Param('docId', ParseUUIDPipe) docId: string, @Body() body: VerifyDocumentDto, @CurrentUser() user: any) {
    return this.workersService.verifyDocument(user, docId, body);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.workersService.findOne(user, id);
  }

  @Post('concierge')
  @Roles(...STAFF)
  createConcierge(@CurrentUser() user: any, @Body() body: ConciergeWorkerDto) {
    return this.workersService.createConciergeWorker(user, body);
  }

  @Post(':id/documents')
  @UseInterceptors(upload)
  uploadDocument(
    @CurrentUser() user: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UploadDocumentDto,
    @UploadedFile() file: any,
  ) {
    return this.workersService.uploadDocument(user, id, body, file);
  }

  @Patch('me/preferences')
  @Roles(Role.RELIEF_WORKER)
  updatePreferences(@CurrentUser() user: any, @Body() body: UpdatePreferencesDto) {
    return this.workersService.updatePreferences(user.reliefProfile.id, body);
  }

  @Post('me/watch-shift/:shiftId')
  @Roles(Role.RELIEF_WORKER)
  toggleWatchShift(@CurrentUser() user: any, @Param('shiftId', ParseUUIDPipe) shiftId: string) {
    return this.workersService.toggleWatchShift(user.reliefProfile.id, shiftId);
  }

  @Post('me/favourite-branch/:branchId')
  @Roles(Role.RELIEF_WORKER)
  toggleFavouriteBranch(@CurrentUser() user: any, @Param('branchId', ParseUUIDPipe) branchId: string) {
    return this.workersService.toggleFavouriteBranch(user.reliefProfile.id, branchId);
  }
}
