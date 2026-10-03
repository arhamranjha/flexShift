import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve, sep } from 'path';

export interface StoredFile {
  key: string;
}

/**
 * Document storage. Callers only see opaque keys, so the backend can change without touching them:
 *  - default: local disk under UPLOAD_DIR
 *  - S3: set S3_BUCKET (plus S3_REGION; S3_ENDPOINT for S3-compatible servers; credentials come from the
 *    standard AWS chain, e.g. an IAM role). Objects are written with server-side encryption (S3_SSE, default AES256).
 */
@Injectable()
export class StorageService {
  private root = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
  private bucket = process.env.S3_BUCKET;
  private s3 = this.bucket
    ? new S3Client({
        region: process.env.S3_REGION || 'eu-west-2',
        ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
      })
    : null;

  get backend() {
    return this.s3 ? 's3' : 'disk';
  }

  async save(file: { buffer: Buffer; originalname: string; mimetype?: string }): Promise<StoredFile> {
    const key = `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 10)}`;
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: `documents/${key}`,
          Body: file.buffer,
          ContentType: file.mimetype,
          ServerSideEncryption: (process.env.S3_SSE as 'AES256' | 'aws:kms') || 'AES256',
        }),
      );
      return { key };
    }
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(join(this.root, key), file.buffer);
    return { key };
  }

  async read(key: string): Promise<Buffer> {
    if (this.s3) {
      try {
        const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: `documents/${key}` }));
        return Buffer.from(await out.Body!.transformToByteArray());
      } catch (e) {
        if ((e as { name?: string }).name === 'NoSuchKey') throw new NotFoundException('File not found');
        throw e;
      }
    }
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep) && path !== this.root) throw new NotFoundException('File not found');
    try {
      return await fs.readFile(path);
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}
