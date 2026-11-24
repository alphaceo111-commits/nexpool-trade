import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import type { ServiceConfig } from "../src/config.js";
import type { ContactRecord, TelegramGateway } from "../src/gateway.js";
import { signRequest } from "../src/crypto.js";
import type { AuthorizedAccount, LoginFlow, LoginFlowState } from "../src/types.js";
import { Vault } from "../src/vault.js";

const SECRET = "test-secret-that-is-long-enough-for-validation";
const KEY = Buffer.alloc(32, 7);

class FakeFlow implements LoginFlow {
  state: LoginFlowState = "pending";
  qrUrl: string | null = "tg://login?token=fake";
  expiresAt: number | null = Date.now() + 30_000;
  error: string | null = null;
  cancelled = false;
  private resolveAuthorized!: (value: AuthorizedAccount) => void;
  private readonly promise = new Promise<AuthorizedAccount>((resolve) => {
    this.resolveAuthorized = resolve;
  });

  wait() {
    return this.promise;
  }

  authorize() {
    this.state = "authorized";
    this.resolveAuthorized({
      session: "SESSION_STRING_SHOULD_STAY_SECRET",
      telegramId: "777",
      name: "Test Account",
      username: "tester",
    });
  }

  async cancel() {
    this.cancelled = true;
    if (this.state === "pending") this.state = "failed";
  }
}

class FakeGateway implements TelegramGateway {
  configured = true;
  flow = new FakeFlow();
  loggedOut = false;
  contacts: ContactRecord[] = [
    { telegramId: "1", name: "Alice", username: "alice", phoneHash: "h1" },
    { telegramId: "2", name: "Bob", username: null, phoneHash: "h2" },
    { telegramId: "2", name: "Bob duplicate", username: null, phoneHash: "h2" },
    { telegramId: "3", name: "Carol", username: "carol", phoneHash: "h3" },
  ];

  async startLogin() {
    this.flow = new FakeFlow();
    return this.flow;
  }

  async fetchContacts() {
    return this.contacts;
  }

  async logout() {
    this.loggedOut = true;
  }
}

function config(overrides: Partial<ServiceConfig> = {}): ServiceConfig {
  return {
    port: 0,
    dataDir: "",
    sharedSecret: SECRET,
    encryptionKey: KEY,
    apiId: 1,
    apiHash: "hash",
    maxContacts: 2,
    contactRetentionMs: 7 * 86_400_000,
    loginRateLimitPerMinute: 5,
    ...overrides,
  };
}

let server: Server | undefined;
let baseUrl: string;
let dir: string;
let gateway: FakeGateway;
let vault: Vault;

async function start(options: Partial<ServiceConfig> = {}) {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
  dir = await mkdtemp(path.join(tmpdir(), "nexpool-tg-"));
  vault = new Vault(path.join(dir, "vault.enc"), KEY);
  gateway = new FakeGateway();
  const app = createApp({ config: config(options), gateway, vault });
  server = createServer(app);
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

function headers(
  method: string,
  pathname: string,
  body: string,
  owner = "owner-12345678",
  timestamp = Date.now(),
) {
  return {
    "content-type": "application/json",
    "x-nexpool-owner": owner,
    "x-nexpool-timestamp": String(timestamp),
    "x-nexpool-signature": signRequest({
      secret: SECRET,
      timestamp: String(timestamp),
      method,
      path: pathname,
      body,
    }),
  };
}

async function call(
  method: string,
  pathname: string,
  body: object | null = null,
  owner = "owner-12345678",
) {
  const raw = body ? JSON.stringify(body) : "";
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: headers(method, pathname, raw, owner),
    body: raw || undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function loginAndConnect() {
  const created = await call("POST", "/v1/login");
  expect(created.status).toBe(201);
  const challengeId = created.body.challengeId as string;
  gateway.flow.authorize();
  const polled = await call("GET", `/v1/login/${challengeId}`);
  expect(polled.body.state).toBe("authorized");
  const account = await call("POST", `/v1/login/${challengeId}/account`);
  expect(account.status).toBe(201);
  return account.body.id as string;
}

beforeEach(async () => {
  await start();
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
  await rm(dir, { recursive: true, force: true });
});

describe("health and authentication", () => {
  test("health is public and never leaks secrets", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.telegramConfigured).toBe(true);
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain(KEY.toString("base64"));
  });

  test("rejects unsigned and tampered requests", async () => {
    const unsigned = await fetch(`${baseUrl}/v1/login`, { method: "POST" });
    expect(unsigned.status).toBe(401);

    const raw = "{}";
    const tampered = await fetch(`${baseUrl}/v1/login`, {
      method: "POST",
      headers: {
        ...headers("POST", "/v1/login", raw),
        "x-nexpool-signature": "00".repeat(32),
      },
      body: raw,
    });
    expect(tampered.status).toBe(401);
  });

  test("rejects stale timestamps", async () => {
    const raw = "";
    const response = await fetch(`${baseUrl}/v1/accounts/unknown`, {
      headers: headers("GET", "/v1/accounts/unknown", raw, "owner-12345678", Date.now() - 600_000),
    });
    expect(response.status).toBe(401);
  });

  test("missing owner reference is unauthorised", async () => {
    const raw = "";
    const response = await fetch(`${baseUrl}/v1/login`, {
      method: "POST",
      headers: headers("POST", "/v1/login", raw, ""),
      body: raw,
    });
    expect(response.status).toBe(401);
  });
});

describe("QR login and vault", () => {
  test("login challenge exposes a tg:// token and authorises", async () => {
    const created = await call("POST", "/v1/login");
    expect(String(created.body.qrUrl).startsWith("tg://login?token=")).toBe(
      true,
    );

    const pending = await call("GET", `/v1/login/${created.body.challengeId}`);
    expect(pending.body.state).toBe("pending");

    gateway.flow.authorize();
    const authorized = await call("GET", `/v1/login/${created.body.challengeId}`);
    expect(authorized.body.state).toBe("authorized");

    const account = await call("POST", `/v1/login/${created.body.challengeId}/account`);
    expect(account.status).toBe(201);
    expect(account.body.session).toBeUndefined();
    expect(account.body.contactCount).toBe(0);
  });

  test("session is encrypted at rest and never returned over HTTP", async () => {
    const accountId = await loginAndConnect();
    const onDisk = await readFile(path.join(dir, "vault.enc"), "utf8");
    expect(onDisk).not.toContain("SESSION_STRING_SHOULD_STAY_SECRET");

    const stored = await vault.read();
    expect(stored.accounts[accountId]?.session).toBe(
      "SESSION_STRING_SHOULD_STAY_SECRET",
    );

    const fetched = await call("GET", `/v1/accounts/${accountId}`);
    expect(JSON.stringify(fetched.body)).not.toContain("SESSION_STRING");
  });

  test("another owner cannot read or revoke the account", async () => {
    const accountId = await loginAndConnect();
    const other = await call("GET", `/v1/accounts/${accountId}`, null, "other-87654321");
    expect(other.status).toBe(403);
    const revoke = await call(
      "POST",
      `/v1/accounts/${accountId}/disconnect`,
      null,
      "other-87654321",
    );
    expect(revoke.status).toBe(403);
  });

  test("login is rate limited per owner", async () => {
    await start({ loginRateLimitPerMinute: 2 });
    expect((await call("POST", "/v1/login")).status).toBe(201);
    expect((await call("POST", "/v1/login")).status).toBe(201);
    expect((await call("POST", "/v1/login")).status).toBe(429);
  });
});

describe("contacts", () => {
  test("sync dedupes, caps and stores only hashed phones", async () => {
    const accountId = await loginAndConnect();
    const synced = await call("POST", `/v1/accounts/${accountId}/sync`);
    expect(synced.status).toBe(200);
    expect(synced.body.contactCount).toBe(2);
    expect(synced.body.truncated).toBe(true);

    const listed = await call("GET", `/v1/accounts/${accountId}/contacts`);
    expect(listed.body.contacts).toHaveLength(2);
    expect(listed.body.contacts[0].phoneHash).toBeUndefined();
    expect(JSON.stringify(listed.body)).not.toContain("phoneHash");
  });

  test("contacts endpoint is owner scoped", async () => {
    const accountId = await loginAndConnect();
    await call("POST", `/v1/accounts/${accountId}/sync`);
    const other = await call(
      "GET",
      `/v1/accounts/${accountId}/contacts`,
      null,
      "other-87654321",
    );
    expect(other.status).toBe(403);
  });
});

describe("disconnect", () => {
  test("revokes the session and deletes the account", async () => {
    const accountId = await loginAndConnect();
    const response = await call("POST", `/v1/accounts/${accountId}/disconnect`);
    expect(response.status).toBe(200);
    expect(response.body.revoked).toBe(true);
    expect(gateway.loggedOut).toBe(true);

    const after = await call("GET", `/v1/accounts/${accountId}`);
    expect(after.status).toBe(404);
    const stored = await vault.read();
    expect(stored.accounts[accountId]).toBeUndefined();
  });
});

describe("unconfigured deployment", () => {
  test("login fails clearly when API credentials are absent", async () => {
    await start();
    gateway.configured = false;
    const response = await call("POST", "/v1/login");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("not_configured");
  });
});
