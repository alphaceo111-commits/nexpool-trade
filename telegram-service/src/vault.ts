import { mkdir, readFile, rename, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { decrypt, encrypt } from "./crypto.js";
import type { VaultData } from "./types.js";

const EMPTY: VaultData = { accounts: {} };

/**
 * Whole-vault encryption at rest. Sessions never touch disk in plaintext and
 * never leave the service; callers receive an account id, not a session.
 */
export class Vault {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly key: Buffer,
  ) {}

  async read(): Promise<VaultData> {
    try {
      const raw = await readFile(this.file, "utf8");
      if (!raw.trim()) return structuredClone(EMPTY);
      const parsed = JSON.parse(decrypt(raw.trim(), this.key)) as VaultData;
      return parsed.accounts ? parsed : structuredClone(EMPTY);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY);
      }
      throw error;
    }
  }

  /** Serialised writes: the service is single-process, and a lost update here
   * would mean a lost session. */
  async update<T>(mutate: (data: VaultData) => T | Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      const data = await this.read();
      const result = await mutate(data);
      await this.write(data);
      return result;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async write(data: VaultData): Promise<void> {
    const dir = path.dirname(this.file);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, encrypt(JSON.stringify(data), this.key), {
      mode: 0o600,
    });
    await rename(tmp, this.file);
    await chmod(this.file, 0o600).catch(() => undefined);
  }
}
