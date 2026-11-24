export type ServiceConfig = {
  port: number;
  dataDir: string;
  sharedSecret: string;
  encryptionKey: Buffer;
  apiId: number | null;
  apiHash: string | null;
  maxContacts: number;
  contactRetentionMs: number;
  loginRateLimitPerMinute: number;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/**
 * Secrets come from the hosting environment only. The service refuses to boot
 * without a signing secret and a 32-byte vault key, so a misconfigured deploy
 * fails loudly instead of running with plaintext sessions.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const sharedSecret = required(env, "SERVICE_SHARED_SECRET");
  if (sharedSecret.length < 32) {
    throw new Error("SERVICE_SHARED_SECRET must be at least 32 characters.");
  }

  const rawKey = required(env, "SESSION_ENCRYPTION_KEY");
  const encryptionKey = Buffer.from(rawKey, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error(
      "SESSION_ENCRYPTION_KEY must be 32 bytes, base64 encoded (openssl rand -base64 32).",
    );
  }

  const apiIdRaw = env.TELEGRAM_API_ID?.trim();
  const apiHashRaw = env.TELEGRAM_API_HASH?.trim();
  let apiId: number | null = null;
  if (apiIdRaw) {
    const parsed = Number(apiIdRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("TELEGRAM_API_ID must be an integer.");
    }
    apiId = parsed;
  }
  const apiHash = apiHashRaw || null;
  if ((apiId === null) !== (apiHash === null)) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be set together.");
  }

  return {
    port: Number(env.PORT ?? 8080),
    dataDir: env.DATA_DIR?.trim() || "/data",
    sharedSecret,
    encryptionKey,
    apiId,
    apiHash,
    maxContacts: Number(env.MAX_CONTACTS ?? 2000),
    contactRetentionMs: Number(env.CONTACT_RETENTION_DAYS ?? 7) * 86_400_000,
    loginRateLimitPerMinute: Number(env.LOGIN_RATE_LIMIT_PER_MINUTE ?? 5),
  };
}
