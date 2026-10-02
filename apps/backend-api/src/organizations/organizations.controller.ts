import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findAll() {
    return this.organizationsService.findAll();
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() body: any) {
    return this.organizationsService.create(body);
  }
}
