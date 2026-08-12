import fs from "fs/promises";
import path from "path";

export interface Storage {
  save(key: string, content: string | Buffer): Promise<{ location: string }>;
  read(location: string): Promise<string>;
  readBuffer(location: string): Promise<Buffer>;
  remove(location: string): Promise<void>;
}

// No S3 bucket is configured yet (Docs/Dev/EduWand_Environment_Setup.md section 8).
// This stores generated files (CSV exports) and uploaded files (admission
// documents, FR-EG-6) on local disk instead. Swap for an S3Storage implementing
// the same interface once S3_DOCUMENTS_BUCKET is available - callers only
// depend on the Storage interface, not this implementation.
class LocalStorage implements Storage {
  private readonly baseDir = path.join(process.cwd(), "var", "exports");

  async save(key: string, content: string | Buffer) {
    const location = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(location), { recursive: true });
    await fs.writeFile(location, content);
    return { location };
  }

  async read(location: string) {
    return fs.readFile(location, "utf-8");
  }

  async readBuffer(location: string) {
    return fs.readFile(location);
  }

  async remove(location: string) {
    await fs.rm(location, { force: true });
  }
}

export const storage: Storage = new LocalStorage();
