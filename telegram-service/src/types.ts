export type StoredContact = {
  telegramId: string;
  name: string;
  username: string | null;
  /** HMAC of the phone number. Raw phone numbers are never persisted. */
  phoneHash: string;
  updatedAt: number;
};

export type StoredAccount = {
  id: string;
  ownerRef: string;
  /** MTProto session string. Lives only inside the encrypted vault. */
  session: string;
  telegramId: string;
  name: string;
  username: string | null;
  createdAt: number;
  lastSyncAt: number | null;
  contacts: StoredContact[];
};

export type VaultData = {
  accounts: Record<string, StoredAccount>;
};

export type AuthorizedAccount = {
  session: string;
  telegramId: string;
  name: string;
  username: string | null;
};

export type LoginFlowState = "pending" | "authorized" | "failed";

export type LoginFlow = {
  readonly state: LoginFlowState;
  readonly qrUrl: string | null;
  readonly expiresAt: number | null;
  readonly error: string | null;
  wait(): Promise<AuthorizedAccount>;
  cancel(): Promise<void>;
};
