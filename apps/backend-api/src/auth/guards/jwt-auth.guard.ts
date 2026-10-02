import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Endpoints a user holding a temporary password may still call. */
const ALLOWED_WHILE_PASSWORD_CHANGE_PENDING = ['/auth/change-password', '/auth/logout', '/auth/me'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    await super.canActivate(context);
    const req = context.switchToHttp().getRequest();
    if (req.user?.mustChangePassword) {
      const path = String(req.originalUrl || req.url).split('?')[0];
      if (!ALLOWED_WHILE_PASSWORD_CHANGE_PENDING.includes(path)) {
        throw new ForbiddenException('You must change your temporary password before continuing');
      }
    }
    return true;
  }
}
