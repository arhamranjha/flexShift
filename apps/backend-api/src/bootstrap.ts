import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { csrfGuard } from './auth/session';

/** Shared by main.ts and the e2e tests so tests exercise the real pipeline. */
export function configureApp(app: INestApplication) {
  if (process.env.TRUST_PROXY) (app as any).set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.use(csrfGuard);
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
}
