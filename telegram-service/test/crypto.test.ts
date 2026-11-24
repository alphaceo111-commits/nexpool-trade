import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import {
  decrypt,
  encrypt,
  hashPhone,
  signRequest,
  verifyRequest,
} from "../src/crypto.js";

const key = randomBytes(32);
const secret = "a-shared-secret-long-enough-to-pass";

describe("vault encryption", () => {
  test("roundtrips and produces different ciphertexts", () => {
    const first = encrypt("session-value", key);
    const second = encrypt("session-value", key);
    expect(first).not.toBe(second);
    expect(decrypt(first, key)).toBe("session-value");
    expect(decrypt(second, key)).toBe("session-value");
  });

  test("rejects a modified ciphertext or the wrong key", () => {
    const payload = encrypt("session-value", key);
    const parts = payload.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(payload, randomBytes(32))).toThrow();
  });

  test("rejects an unknown format", () => {
    expect(() => decrypt("v0.a.b.c", key)).toThrow(/Unsupported/);
  });
});

describe("request signing", () => {
  const base = {
    secret,
    timestamp: "1795000000000",
    method: "POST",
    path: "/v1/login",
    body: '{"a":1}',
  };

  test("accepts a valid signature", () => {
    const signature = signRequest(base);
    expect(
      verifyRequest({ ...base, signature, now: 1795000000000 }).ok,
    ).toBe(true);
  });

  test("rejects a different body, path or stale timestamp", () => {
    const signature = signRequest(base);
    expect(
      verifyRequest({ ...base, body: '{"a":2}', signature, now: 1795000000000 }).ok,
    ).toBe(false);
    expect(
      verifyRequest({ ...base, path: "/v1/accounts", signature, now: 1795000000000 }).ok,
    ).toBe(false);
    expect(
      verifyRequest({ ...base, signature, now: 1795000000000 + 400_000 }).ok,
    ).toBe(false);
  });
});

describe("phone hashing", () => {
  test("is deterministic, normalised and not reversible", () => {
    const a = hashPhone("+1 (555) 010-9999", secret);
    const b = hashPhone("15550109999", secret);
    expect(a).toBe(b);
    expect(a).not.toContain("555");
    expect(hashPhone("15550109999", `${secret}-other`)).not.toBe(a);
  });
});
