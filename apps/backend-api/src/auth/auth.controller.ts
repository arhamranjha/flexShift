import { Controller, Post, Body, Get, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto, LoginDto, RegisterReliefWorkerDto } from './dto/auth.dto';

const AUTH_LIMIT = { default: { limit: Number(process.env.AUTH_THROTTLE_LIMIT) || 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle(AUTH_LIMIT)
  login(@Body() body: LoginDto) {
    return this.authService.login(body);
  }

  @Post('register/relief-worker')
  @Throttle(AUTH_LIMIT)
  registerReliefWorker(@Body() body: RegisterReliefWorkerDto) {
    return this.authService.registerReliefWorker(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: any) {
    return user;
  }

  /** Revokes every token issued so far for this user. */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  changePassword(@CurrentUser() user: any, @Body() body: ChangePasswordDto) {
    return this.authService.changePassword(user.id, body);
  }
}
