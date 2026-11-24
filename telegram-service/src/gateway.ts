import { Api, TelegramClient } from "teleproto";
import { StringSession } from "teleproto/sessions";
import { hashPhone } from "./crypto.js";
import type { AuthorizedAccount, LoginFlow, LoginFlowState } from "./types.js";

export type ContactRecord = {
  telegramId: string;
  name: string;
  username: string | null;
  phoneHash: string;
};

export interface TelegramGateway {
  readonly configured: boolean;
  startLogin(): Promise<LoginFlow>;
  fetchContacts(session: string): Promise<ContactRecord[]>;
  logout(session: string): Promise<void>;
}

class TeleprotoQrLogin implements LoginFlow {
  state: LoginFlowState = "pending";
  qrUrl: string | null = null;
  expiresAt: number | null = null;
  error: string | null = null;

  private readonly controller = new AbortController();
  private readonly promise: Promise<AuthorizedAccount>;

  constructor(
    private readonly client: TelegramClient,
    credentials: { apiId: number; apiHash: string },
  ) {
    this.promise = client
      .signInUserWithQrCode(credentials, {
        qrCode: async ({ token, expires }) => {
          this.qrUrl = `tg://login?token=${token.toString("base64url")}`;
          this.expiresAt = Date.now() + expires * 1000;
        },
        // NEXPOOL never receives a 2FA password. If Telegram asks for one, the
        // user must authorise from an already signed-in Telegram app.
        password: async () => {
          throw new Error(
            "This account requires two-factor confirmation in Telegram.",
          );
        },
        onError: async (cause: Error) => {
          this.error = cause.message;
          return true;
        },
        abortSignal: this.controller.signal,
      })
      .then((user: Api.TypeUser) => {
        if (!(user instanceof Api.User)) {
          throw new Error("Telegram returned an empty account after login.");
        }
        const session = this.client.session.save();
        if (!session) {
          throw new Error("Telegram did not return a session after login.");
        }
        this.state = "authorized";
        return {
          session,
          telegramId: String(user.id),
          name:
            [user.firstName, user.lastName].filter(Boolean).join(" ") ||
            user.username ||
            "Telegram user",
          username: user.username ?? null,
        };
      })
      .catch((cause: Error) => {
        if (this.state !== "authorized") {
          this.state = "failed";
          this.error ??= cause.message;
        }
        throw cause;
      });
    // Cancellation or expiry can reject before anyone polls; keep Node quiet.
    void this.promise.catch(() => undefined);
  }

  wait(): Promise<AuthorizedAccount> {
    return this.promise;
  }

  async cancel(): Promise<void> {
    this.controller.abort();
    await this.client.disconnect().catch(() => undefined);
    if (this.state === "pending") this.state = "failed";
  }
}

/** Real MTProto gateway. Sessions stay inside this process and the vault. */
export class TeleprotoGateway implements TelegramGateway {
  constructor(
    private readonly credentials: { apiId: number | null; apiHash: string | null },
    private readonly phonePepper: string,
  ) {}

  get configured(): boolean {
    return this.credentials.apiId !== null && this.credentials.apiHash !== null;
  }

  private requireCredentials(): { apiId: number; apiHash: string } {
    if (!this.configured) {
      throw new Error(
        "Telegram API credentials are not configured on the integration service.",
      );
    }
    return {
      apiId: this.credentials.apiId as number,
      apiHash: this.credentials.apiHash as string,
    };
  }

  async startLogin(): Promise<LoginFlow> {
    const credentials = this.requireCredentials();
    const client = new TelegramClient(
      new StringSession(""),
      credentials.apiId,
      credentials.apiHash,
      { connectionRetries: 3 },
    );
    await client.connect();
    return new TeleprotoQrLogin(client, credentials);
  }

  async fetchContacts(session: string): Promise<ContactRecord[]> {
    const credentials = this.requireCredentials();
    const client = new TelegramClient(
      new StringSession(session),
      credentials.apiId,
      credentials.apiHash,
      { connectionRetries: 3 },
    );
    await client.connect();
    try {
      const users = await client.getContacts();
      return users.map((user: Api.User) => ({
        telegramId: String(user.id),
        name:
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.username ||
          "Telegram contact",
        username: user.username ?? null,
        phoneHash: hashPhone(user.phone, this.phonePepper),
      }));
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }

  async logout(session: string): Promise<void> {
    const credentials = this.requireCredentials();
    const client = new TelegramClient(
      new StringSession(session),
      credentials.apiId,
      credentials.apiHash,
      { connectionRetries: 2 },
    );
    await client.connect();
    try {
      await client.logOut();
    } finally {
      await client.disconnect().catch(() => undefined);
    }
  }
}
