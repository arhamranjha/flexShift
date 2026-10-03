import { NotFoundException } from '@nestjs/common';
import { StorageService } from '../src/storage/storage.service';

/**
 * Runs against any S3-compatible server. Locally:
 *   docker run -d -p 9090:9090 -e initialBuckets=flexshift-test adobe/s3mock
 *   S3_TEST_ENDPOINT=http://localhost:9090 pnpm test
 * Skipped when S3_TEST_ENDPOINT is not set.
 */
const endpoint = process.env.S3_TEST_ENDPOINT;
const d = endpoint ? describe : describe.skip;

d('StorageService (S3 backend)', () => {
  let storage: StorageService;
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ['S3_BUCKET', 'S3_ENDPOINT', 'S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']) saved[k] = process.env[k];
    process.env.S3_BUCKET = process.env.S3_TEST_BUCKET || 'flexshift-test';
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    storage = new StorageService();
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
  });

  it('selects the S3 backend from the environment', () => {
    expect(storage.backend).toBe('s3');
  });

  it('round-trips a document through the bucket', async () => {
    const body = Buffer.from('%PDF-1.4 stored in s3 ✓');
    const { key } = await storage.save({ buffer: body, originalname: 'Passport.PDF', mimetype: 'application/pdf' });
    expect(key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect((await storage.read(key)).equals(body)).toBe(true);
  });

  it('answers 404 for a missing object', async () => {
    await expect(storage.read('00000000-0000-0000-0000-000000000000.pdf')).rejects.toBeInstanceOf(NotFoundException);
  });
});
