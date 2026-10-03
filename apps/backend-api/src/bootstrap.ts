import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import { csrfGuard } from './auth/session';

/** Shared by main.ts and the e2e tests so tests exercise the real pipeline. */
export function configureApp(app: INestApplication) {
  if (process.env.TRUST_PROXY) (app as any).set('trust proxy', process.env.TRUST_PROXY === 'true' ? true : Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  // Every response carries a request id (an incoming one is kept when it is a sane token) for log correlation.
  // HTTP_LOGS=true adds one JSON access-log line per request.
  app.use((req: any, res: any, next: any) => {
    const incoming = String(req.headers['x-request-id'] ?? '');
    const id = /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    if (process.env.HTTP_LOGS === 'true') {
      const t0 = Date.now();
      res.on('finish', () => console.log(JSON.stringify({ t: new Date().toISOString(), id, method: req.method, path: String(req.originalUrl).split('?')[0], status: res.statusCode, ms: Date.now() - t0 })));
    }
    next();
  });
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
