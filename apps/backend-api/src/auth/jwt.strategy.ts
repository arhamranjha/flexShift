import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'flexshift-secure-jwt-secret-key-2026',
    });
  }

  async validate(payload: { sub: string; email: string; role: any }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        reliefProfile: true,
        managedBranch: true,
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or not found');
    }
    return user;
  }
}
