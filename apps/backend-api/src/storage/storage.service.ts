import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve } from 'path';

export interface StoredFile {
  key: string;
}

/**
 * Document storage. Local-disk implementation; swap the body of these methods
 * for S3 (PutObject/GetObject) without touching callers.
 */
@Injectable()
export class StorageService {
  private root = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));

  async save(file: { buffer: Buffer; originalname: string }): Promise<StoredFile> {
    await fs.mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}${extname(file.originalname).toLowerCase().slice(0, 10)}`;
    await fs.writeFile(join(this.root, key), file.buffer);
    return { key };
  }

  async read(key: string): Promise<Buffer> {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + '/') && path !== this.root) throw new NotFoundException('File not found');
    try {
      return await fs.readFile(path);
    } catch {
      throw new NotFoundException('File not found');
    }
  }
}
