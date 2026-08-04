import fs from "fs/promises";
import path from "path";

export interface Storage {
  save(key: string, content: string): Promise<{ location: string }>;
  read(location: string): Promise<string>;
}

// No S3 bucket is configured yet (Docs/Dev/EduWand_Environment_Setup.md section 8).
// This stores generated files on local disk instead. Swap for an S3Storage
// implementing the same interface once S3_DOCUMENTS_BUCKET is available -
// callers only depend on the Storage interface, not this implementation.
class LocalStorage implements Storage {
  private readonly baseDir = path.join(process.cwd(), "var", "exports");

  async save(key: string, content: string) {
    const location = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(location), { recursive: true });
    await fs.writeFile(location, content, "utf-8");
    return { location };
  }

  async read(location: string) {
    return fs.readFile(location, "utf-8");
  }
}

export const storage: Storage = new LocalStorage();
