import type { Request, Response } from 'express';

/**
 * Browser sessions live in an HttpOnly cookie so page scripts (and therefore XSS) cannot read the token.
 * Each frontend names itself in the X-FlexShift-App header and gets its own cookie: on localhost cookies
 * ignore ports, so one shared cookie would let the dashboard and the worker portal overwrite each other.
 */
const APPS = ['admin', 'worker'];
const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

export const appFor = (req: Request) => {
  const h = String(req.headers['x-flexshift-app'] ?? '').toLowerCase();
  return APPS.includes(h) ? h : 'admin';
};
export const cookieName = (app: string) => `fs_${app}`;

const secure = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production');
/** lax (default) suits apps and API on one site (e.g. app.example.com + api.example.com); none needs HTTPS for apps on different sites. */
const sameSite = (): 'lax' | 'strict' | 'none' => {
  const v = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return v === 'none' || v === 'strict' ? v : 'lax';
};

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(cookieName(appFor(req)), token, { httpOnly: true, sameSite: sameSite(), secure: secure() || sameSite() === 'none', path: '/', maxAge: SEVEN_DAYS });
}

export function clearSessionCookie(req: Request, res: Response) {
  res.clearCookie(cookieName(appFor(req)), { httpOnly: true, sameSite: sameSite(), secure: secure() || sameSite() === 'none', path: '/' });
}

/** passport-jwt extractor: the session cookie belonging to the calling app. */
export const cookieExtractor = (req: Request): string | null => req?.cookies?.[cookieName(appFor(req))] ?? null;

/**
 * CSRF defence for cookie sessions: a state-changing request authenticated only by a cookie must carry a
 * custom header. Browsers cannot add one cross-origin without a CORS preflight, which only allow-listed
 * origins pass. Bearer-token callers (tools, tests) are unaffected.
 */
export function csrfGuard(req: Request, res: Response, next: () => void) {
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const hasSessionCookie = Object.keys(req.cookies ?? {}).some((k) => k.startsWith('fs_'));
  if (unsafe && hasSessionCookie && !req.headers.authorization && req.headers['x-requested-with'] !== 'flexshift') {
    res.status(403).json({ statusCode: 403, message: 'Missing X-Requested-With header', error: 'Forbidden' });
    return;
  }
  next();
}
