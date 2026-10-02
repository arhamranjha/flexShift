/** Fails fast at boot when required configuration is missing or weak. */
export function validateEnv(env: Record<string, unknown>) {
  const secret = String(env.JWT_SECRET ?? '');
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL must be set');
  return env;
}
