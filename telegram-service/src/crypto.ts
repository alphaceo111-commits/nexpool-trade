import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decrypt(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unsupported vault format.");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  if (!ivPart || !tagPart || !dataPart) throw new Error("Corrupt vault payload.");
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Corrupt vault payload.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function signRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(
      [input.timestamp, input.method.toUpperCase(), input.path, input.body].join(
        "\n",
      ),
    )
    .digest("hex");
}

export function verifyRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  path: string;
  body: string;
  signature: string;
  now?: number;
}): { ok: true } | { ok: false; reason: string } {
  const timestamp = Number(input.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "invalid timestamp" };
  const now = input.now ?? Date.now();
  if (Math.abs(now - timestamp) > TIMESTAMP_WINDOW_MS) {
    return { ok: false, reason: "timestamp outside window" };
  }
  const expected = signRequest(input);
  const given = Buffer.from(input.signature, "hex");
  const wanted = Buffer.from(expected, "hex");
  if (given.length !== wanted.length) return { ok: false, reason: "bad signature" };
  return timingSafeEqual(given, wanted)
    ? { ok: true }
    : { ok: false, reason: "bad signature" };
}

export function hashPhone(phone: string | undefined, secret: string): string {
  const normalised = (phone ?? "").replace(/\D/g, "");
  return createHmac("sha256", secret).update(normalised).digest("hex").slice(0, 32);
}
