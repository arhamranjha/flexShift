import { Controller, Get, Post, Patch, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CreateOrganizationDto, OnboardOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findAll(@CurrentUser() user: any) {
    return this.organizationsService.findAll(user);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  findOne(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.organizationsService.findOne(user, id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() body: CreateOrganizationDto) {
    return this.organizationsService.create(body);
  }

  /** Super admins onboard a customer in one step; the response carries one-time temporary passwords. */
  @Post('onboard')
  @Roles(Role.SUPER_ADMIN)
  onboard(@Body() body: OnboardOrganizationDto) {
    return this.organizationsService.onboard(body);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateOrganizationDto) {
    return this.organizationsService.update(user, id, body);
  }
}
