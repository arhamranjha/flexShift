import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { CreateStaffUserDto, UpdateStaffUserDto } from './users.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ORG_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: any) {
    return this.usersService.list(user);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() body: CreateStaffUserDto) {
    return this.usersService.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: any, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateStaffUserDto) {
    return this.usersService.update(user, id, body);
  }
}
