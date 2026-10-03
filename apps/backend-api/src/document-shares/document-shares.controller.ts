import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DocumentSharesService } from './document-shares.service';

const SHARE_LIMIT = { default: { limit: Number(process.env.SHARE_THROTTLE_LIMIT) || 10, ttl: 60_000 } };
import { AcceptDocumentShareDto, CreateDocumentShareDto, DocumentShareQueryDto } from './dto/document-share.dto';

/** The signed-in worker's own requests (no worker id in the URL, like the rest of /relief-workers/me). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.RELIEF_WORKER)
@Controller('relief-workers/me/document-shares')
export class WorkerDocumentSharesController {
  constructor(private shares: DocumentSharesService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.shares.listMine(user.reliefProfile.id);
  }

  /** Each request notifies the organization's admins, so it gets its own tight limit on top of the state rules. */
  @Post()
  @Throttle(SHARE_LIMIT)
  create(@CurrentUser() user: any, @Body() body: CreateDocumentShareDto) {
    return this.shares.create(user.reliefProfile.id, body);
  }

  @Post(':id/withdraw')
  withdraw(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.withdraw(user.reliefProfile.id, id);
  }
}

/** Organization side: requests addressed to the caller's organization. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN, Role.FACILITY_MANAGER)
@Controller('document-shares')
export class DocumentSharesController {
  constructor(private shares: DocumentSharesService) {}

  @Get()
  list(@CurrentUser() user: any, @Query() query: DocumentShareQueryDto) {
    return this.shares.listForOrganization(user, query);
  }

  @Post(':id/accept')
  accept(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: AcceptDocumentShareDto) {
    return this.shares.accept(user, id, body);
  }

  /** Declining blocks the worker from asking again for 30 days, so it is an organization-level decision. */
  @Post(':id/decline')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  decline(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.shares.decline(user, id);
  }
}
