// Runs in every jest worker before test files are loaded.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/flexshift_test?schema=public';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.THROTTLE_LIMIT = '100000';
process.env.AUTH_THROTTLE_LIMIT = '100000';
process.env.UPLOAD_DIR = '/tmp/flexshift-test-uploads';
