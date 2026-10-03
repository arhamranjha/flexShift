import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
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
    // Mapped codes are expected client errors; anything else is a bug or an outage and must not be silent.
    if (status >= 500) new Logger('PrismaExceptionFilter').error(`${e.code} ${e.message}`, e.stack);
    res.status(status).json({ statusCode: status, message, error: HttpStatus[status] });
  }
}

/** A value Prisma rejects as invalid (for example null for a required column) is a client error, not a 500. */
@Catch(Prisma.PrismaClientValidationError)
export class PrismaValidationFilter implements ExceptionFilter {
  catch(_e: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.status(HttpStatus.BAD_REQUEST).json({ statusCode: 400, message: 'One or more values are invalid', error: 'Bad Request' });
  }
}
