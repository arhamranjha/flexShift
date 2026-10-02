# Phase 1: NestJS API Stubs

```typescript
// auth.controller.ts
import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: any) {
    return this.authService.login(loginDto);
  }
}

// relief-workers.controller.ts
import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { ReliefWorkersService } from './relief-workers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('relief-workers')
export class ReliefWorkersController {
  constructor(private readonly reliefWorkersService: ReliefWorkersService) {}

  @Post()
  createProfile(@Body() createProfileDto: any) {
    return this.reliefWorkersService.createProfile(createProfileDto);
  }

  @Patch(':id/documents/:docId')
  verifyDocument(@Param('docId') docId: string, @Body('status') status: string) {
    return this.reliefWorkersService.updateDocumentStatus(docId, status);
  }
}

// shifts.controller.ts
import { Controller, Get, Post, Body, Patch, Param, UseGuards } from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  createShift(@Body() createShiftDto: any) {
    return this.shiftsService.create(createShiftDto);
  }

  @Patch(':id/assign')
  assignShift(@Param('id') id: string, @Body('reliefWorkerId') reliefWorkerId: string) {
    return this.shiftsService.assignWorker(id, reliefWorkerId);
  }
}
```
