import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";

/**
 * Where uploaded files live. Today: a directory on our own server (put it on a
 * persistent, backed-up volume in production). The interface is small so another
 * driver (another server, S3-compatible storage) can be added without touching callers.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

/** Keys we create look like "images/<uuid>.<ext>"; anything else is refused. */
export const KEY_PATTERN = /^images\/[0-9a-f-]{36}\.(png|jpg|gif)$/;

class LocalDiskStorage implements StorageDriver {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  async get(key: string) {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

let storage: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  storage ??= new LocalDiskStorage(path.resolve(env.STORAGE_DIR));
  return storage;
}
