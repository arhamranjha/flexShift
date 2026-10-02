import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        reliefProfile: true,
        managedBranch: true,
        organization: true,
      },
    });
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      const { passwordHash, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: { email: string; password: string }) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        reliefProfile: user.reliefProfile,
        managedBranch: user.managedBranch,
      },
    };
  }

  async registerReliefWorker(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
    registrationNumber: string;
    profession?: string;
    hourlyRate?: number;
    minimumShiftRate?: number;
    systemTags?: string[];
    accreditations?: string[];
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new BadRequestException('Email already registered');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: Role.RELIEF_WORKER,
        },
      });

      const profile = await tx.reliefProfile.create({
        data: {
          userId: user.id,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          registrationNumber: dto.registrationNumber,
          profession: dto.profession || 'Pharmacist',
          hourlyRate: dto.hourlyRate,
          minimumShiftRate: dto.minimumShiftRate,
          systemTags: dto.systemTags || [],
          accreditations: dto.accreditations || [],
        },
      });

      const payload = { sub: user.id, email: user.email, role: user.role };
      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          reliefProfile: profile,
        },
      };
    });
  }
}
