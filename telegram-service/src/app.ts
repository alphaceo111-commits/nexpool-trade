import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { verifyRequest } from "./crypto.js";
import type { ServiceConfig } from "./config.js";
import type { TelegramGateway } from "./gateway.js";
import type { LoginFlow, StoredAccount } from "./types.js";
import { Vault } from "./vault.js";

const MAX_BODY_BYTES = 64 * 1024;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Challenge = {
  id: string;
  ownerRef: string;
  createdAt: number;
  flow: LoginFlow;
};

type Deps = {
  config: ServiceConfig;
  gateway: TelegramGateway;
  vault: Vault;
};

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function publicAccount(account: StoredAccount) {
  return {
    id: account.id,
    telegramId: account.telegramId,
    name: account.name,
    username: account.username,
    createdAt: account.createdAt,
    lastSyncAt: account.lastSyncAt,
    contactCount: account.contacts.length,
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "body_too_large", "Request body is too large.");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * HTTPS API consumed by the NEXPOOL Convex backend only.
 *
 * There is deliberately no endpoint that sends messages: this service proves
 * account connection and permitted contact discovery, and nothing more.
 */
export function createApp(deps: Deps) {
  const challenges = new Map<string, Challenge>();
  const loginAttempts = new Map<string, number[]>();

  const prune = () => {
    const cutoff = Date.now() - CHALLENGE_TTL_MS;
    for (const [id, challenge] of challenges) {
      if (challenge.createdAt < cutoff) {
        void challenge.flow.cancel();
        challenges.delete(id);
      }
    }
  };

  const limitLogin = (ownerRef: string) => {
    const now = Date.now();
    const window = (loginAttempts.get(ownerRef) ?? []).filter(
      (at) => now - at < 60_000,
    );
    if (window.length >= deps.config.loginRateLimitPerMinute) {
      throw new HttpError(429, "rate_limited", "Too many connection attempts.");
    }
    window.push(now);
    loginAttempts.set(ownerRef, window);
  };

  const authenticate = (
    req: IncomingMessage,
    rawBody: string,
    path: string,
  ): string => {
    const owner = String(req.headers["x-nexpool-owner"] ?? "").trim();
    const result = verifyRequest({
      secret: deps.config.sharedSecret,
      timestamp: String(req.headers["x-nexpool-timestamp"] ?? ""),
      method: req.method ?? "GET",
      path,
      body: rawBody,
      signature: String(req.headers["x-nexpool-signature"] ?? ""),
    });
    if (!owner || owner.length < 8 || owner.length > 128) {
      throw new HttpError(401, "unauthorized", "Missing owner reference.");
    }
    if (!result.ok) {
      throw new HttpError(401, "unauthorized", "Invalid request signature.");
    }
    return owner;
  };

  const requireApi = () => {
    if (!deps.gateway.configured) {
      throw new HttpError(
        503,
        "not_configured",
        "Telegram API credentials are not configured on the integration service.",
      );
    }
  };

  const loadAccount = async (id: string, owner: string): Promise<StoredAccount> => {
    const data = await deps.vault.read();
    const account = data.accounts[id];
    if (!account) throw new HttpError(404, "not_found", "Unknown account.");
    if (account.ownerRef !== owner) {
      throw new HttpError(403, "forbidden", "This account belongs to someone else.");
    }
    return account;
  };

  const handle = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    rawBody: string,
  ) => {
    const method = req.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/health") {
      const data = await deps.vault.read();
      return json(res, 200, {
        ok: true,
        telegramConfigured: deps.gateway.configured,
        accounts: Object.keys(data.accounts).length,
        pendingChallenges: challenges.size,
      });
    }

    const owner = authenticate(req, rawBody, path);
    let body: Record<string, unknown> = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        throw new HttpError(400, "invalid_json", "Body is not valid JSON.");
      }
    }
    void body;

    if (method === "POST" && path === "/v1/login") {
      prune();
      requireApi();
      limitLogin(owner);
      const flow = await deps.gateway.startLogin();
      const deadline = Date.now() + 5000;
      while (!flow.qrUrl && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!flow.qrUrl) {
        await flow.cancel();
        throw new HttpError(
          502,
          "telegram_unavailable",
          flow.error ?? "Telegram did not return a login token.",
        );
      }
      const challenge: Challenge = {
        id: randomUUID(),
        ownerRef: owner,
        createdAt: Date.now(),
        flow,
      };
      challenges.set(challenge.id, challenge);
      return json(res, 201, {
        challengeId: challenge.id,
        qrUrl: flow.qrUrl,
        expiresAt: flow.expiresAt,
        state: flow.state,
      });
    }

    const loginMatch = path.match(/^\/v1\/login\/([^/]+)$/);
    if (method === "GET" && loginMatch) {
      const challenge = challenges.get(loginMatch[1] as string);
      if (!challenge) {
        throw new HttpError(404, "not_found", "Login challenge expired.");
      }
      if (challenge.ownerRef !== owner) {
        throw new HttpError(403, "forbidden", "Not your login challenge.");
      }
      return json(res, 200, {
        state: challenge.flow.state,
        qrUrl: challenge.flow.qrUrl,
        expiresAt: challenge.flow.expiresAt,
        error: challenge.flow.error,
      });
    }

    const completeMatch = path.match(/^\/v1\/login\/([^/]+)\/account$/);
    if (method === "POST" && completeMatch) {
      const id = completeMatch[1] as string;
      const challenge = challenges.get(id);
      if (!challenge) {
        throw new HttpError(404, "not_found", "Login challenge expired.");
      }
      if (challenge.ownerRef !== owner) {
        throw new HttpError(403, "forbidden", "Not your login challenge.");
      }
      if (challenge.flow.state !== "authorized") {
        throw new HttpError(
          409,
          "not_authorized",
          "The Telegram account has not authorised this login yet.",
        );
      }
      const authorized = await challenge.flow.wait();
      const accountId = randomUUID();
      const account: StoredAccount = {
        id: accountId,
        ownerRef: owner,
        session: authorized.session,
        telegramId: authorized.telegramId,
        name: authorized.name,
        username: authorized.username,
        createdAt: Date.now(),
        lastSyncAt: null,
        contacts: [],
      };
      await deps.vault.update((data) => {
        data.accounts[accountId] = account;
      });
      challenges.delete(id);
      return json(res, 201, publicAccount(account));
    }

    const accountMatch = path.match(/^\/v1\/accounts\/([^/]+)$/);
    if (method === "GET" && accountMatch) {
      const account = await loadAccount(accountMatch[1] as string, owner);
      return json(res, 200, publicAccount(account));
    }

    const contactsMatch = path.match(/^\/v1\/accounts\/([^/]+)\/contacts$/);
    if (method === "GET" && contactsMatch) {
      const account = await loadAccount(contactsMatch[1] as string, owner);
      const since = Date.now() - deps.config.contactRetentionMs;
      return json(res, 200, {
        lastSyncAt: account.lastSyncAt,
        contacts: account.contacts
          .filter((contact) => contact.updatedAt >= since)
          .map((contact) => ({
            telegramId: contact.telegramId,
            name: contact.name,
            username: contact.username,
            updatedAt: contact.updatedAt,
          })),
      });
    }

    const syncMatch = path.match(/^\/v1\/accounts\/([^/]+)\/sync$/);
    if (method === "POST" && syncMatch) {
      requireApi();
      const account = await loadAccount(syncMatch[1] as string, owner);
      const fetched = await deps.gateway.fetchContacts(account.session);
      const unique = new Map(fetched.map((contact) => [contact.telegramId, contact]));
      const contacts = [...unique.values()]
        .slice(0, deps.config.maxContacts)
        .map((contact) => ({ ...contact, updatedAt: Date.now() }));
      const truncated = unique.size > contacts.length;
      await deps.vault.update((data) => {
        const current = data.accounts[account.id];
        if (!current) throw new HttpError(404, "not_found", "Account removed.");
        current.contacts = contacts;
        current.lastSyncAt = Date.now();
      });
      return json(res, 200, {
        contactCount: contacts.length,
        truncated,
        lastSyncAt: Date.now(),
      });
    }

    const disconnectMatch = path.match(/^\/v1\/accounts\/([^/]+)\/disconnect$/);
    if (method === "POST" && disconnectMatch) {
      const id = disconnectMatch[1] as string;
      const account = await loadAccount(id, owner);
      await deps.gateway.logout(account.session).catch(() => undefined);
      await deps.vault.update((data) => {
        delete data.accounts[id];
      });
      return json(res, 200, { ok: true, revoked: true });
    }

    throw new HttpError(404, "not_found", "Unknown route.");
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://service.local");
    try {
      const rawBody = await readBody(req);
      await handle(req, res, url, rawBody);
    } catch (error) {
      if (error instanceof HttpError) {
        json(res, error.status, {
          error: { code: error.code, message: error.message },
        });
        return;
      }
      json(res, 500, {
        error: {
          code: "internal_error",
          message: "The integration service failed to handle the request.",
        },
      });
    }
  };
}
