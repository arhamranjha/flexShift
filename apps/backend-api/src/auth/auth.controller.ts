import { Controller, Post, Body, Get, HttpCode, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { clearSessionCookie, setSessionCookie } from './session';
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
  async login(@Body() body: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(body);
    setSessionCookie(req, res, result.accessToken);
    return result;
  }

  @Post('register/relief-worker')
  @Throttle(AUTH_LIMIT)
  async registerReliefWorker(@Body() body: RegisterReliefWorkerDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.registerReliefWorker(body);
    setSessionCookie(req, res, result.accessToken);
    return result;
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
  async logout(@CurrentUser() user: any, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearSessionCookie(req, res);
    return this.authService.logout(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: any, @Body() body: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.changePassword(user.id, body);
    setSessionCookie(req, res, result.accessToken); // the old token was just revoked
    return result;
  }
}
