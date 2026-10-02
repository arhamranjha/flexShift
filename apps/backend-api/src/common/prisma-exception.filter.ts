import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/** Maps well-known Prisma errors to HTTP statuses instead of leaking a 500. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const map: Record<string, [number, string]> = {
      P2002: [HttpStatus.CONFLICT, 'A record with these unique values already exists'],
      P2025: [HttpStatus.NOT_FOUND, 'Record not found'],
      P2003: [HttpStatus.BAD_REQUEST, 'A referenced record does not exist'],
    };
    const [status, message] = map[e.code] ?? [HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'];
    res.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }
}
