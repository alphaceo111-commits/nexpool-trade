# NEXPOOL Telegram integration service

Standalone MTProto service for **account connection and permitted contact
discovery**. It is intentionally separate from the NEXPOOL bot and from Convex:
personal-account sessions need a persistent process and must never sit next to
the Mini App.

## Non-goals (by design)

- **No messaging endpoint exists.** Nothing here can send a Telegram message.
  The integration produces contact metadata and a verified account connection;
  invitations stay user-driven through Telegram's own interfaces.
- No contact upload beyond deduplicated, capped metadata. Raw phone numbers are
  never stored — only an HMAC digest.
- No login code or 2FA password is accepted. Login is QR-only.

## What exists

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Public. Reports whether Telegram credentials are configured. |
| POST | `/v1/login` | Starts a QR login; returns `tg://login?token=…`. |
| GET | `/v1/login/:id` | Polls `pending` / `authorized` / `failed`. |
| POST | `/v1/login/:id/account` | Stores the encrypted session, returns an account id. |
| GET | `/v1/accounts/:id` | Account summary (no session, no contacts). |
| POST | `/v1/accounts/:id/sync` | `contacts.getContacts`, deduped and capped. |
| GET | `/v1/accounts/:id/contacts` | Contact metadata within the retention window. |
| POST | `/v1/accounts/:id/disconnect` | `auth.logOut`, then deletes the session and contacts. |

### Request authentication

Every route except `/health` requires three headers:

```
x-nexpool-owner:     opaque owner reference (Convex user id hash)
x-nexpool-timestamp: Date.now() in ms
x-nexpool-signature: hex HMAC-SHA256 of "<timestamp>\n<METHOD>\n<path>\n<body>"
```

The HMAC key is `SERVICE_SHARED_SECRET`. Signatures older or newer than five
minutes are rejected, and the raw body must match byte for byte. Ownership is
enforced per account on every read and write.

## Session security

- The whole vault (`/data/vault.enc`) is AES-256-GCM encrypted with
  `SESSION_ENCRYPTION_KEY`; the file is written atomically with mode `0600`.
- Sessions are returned to **no** HTTP caller. Even `/v1/accounts/:id` omits it.
- Disconnect calls `auth.logOut`, revoking the session on Telegram's side, then
  deletes the record.
- Phone numbers are hashed with HMAC-SHA256; contacts expire after
  `CONTACT_RETENTION_DAYS`.

## Configuration

Set these as Fly secrets — never in the repository, never in Convex:

```bash
fly secrets set \
  SERVICE_SHARED_SECRET="$(openssl rand -hex 32)" \
  SESSION_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  TELEGRAM_API_ID="..." \
  TELEGRAM_API_HASH="..." \
  -a nexpool-telegram
```

| Variable | Required | Notes |
|---|---|---|
| `SERVICE_SHARED_SECRET` | yes | ≥32 chars, shared with Convex |
| `SESSION_ENCRYPTION_KEY` | yes | base64, exactly 32 bytes |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | for login | from my.telegram.org |
| `DATA_DIR` | no | default `/data` |
| `MAX_CONTACTS` | no | default 2000 |
| `CONTACT_RETENTION_DAYS` | no | default 7 |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | no | default 5 per owner |

Without API credentials the service still boots, `/health` reports
`telegramConfigured: false`, and `/v1/login` returns `503 not_configured`. It
refuses to boot at all without the two secrets.

## Run locally

```bash
cd telegram-service
bun install
bun test
bun run dev        # needs the env vars above
```

## Deploy to Fly.io

```bash
cd telegram-service
fly launch --no-deploy --copy-config   # keep the provided fly.toml
fly volumes create nexpool_tg_data --size 1 -a nexpool-telegram
fly secrets set SERVICE_SHARED_SECRET=... SESSION_ENCRYPTION_KEY=... \
  TELEGRAM_API_ID=... TELEGRAM_API_HASH=... -a nexpool-telegram
fly deploy
```

**Run exactly one machine.** The vault is a single encrypted file and login
challenges live in memory; `fly scale count 1` and no autoscaling. Scale-to-zero
is disabled because a login would otherwise lose its in-flight challenge.

## QR login on the same device

The Mini App runs inside Telegram, so scanning its own QR is impossible. The
service returns the `tg://login?token=…` URL; the UI should show a QR for a
second device and also offer the `tg://` link, which opens the Telegram app that
is already signed in. That same-device path is the one that needs real-device
testing before release.

## Not built yet

- The Convex client that signs requests and maps `ownerRef` to a NEXPOOL user.
- Mini App screens for connection, consent, contact list, disconnect.
- Real-account end-to-end verification (requires `api_id`/`api_hash` and a test
  account). The current test suite uses a fake gateway and proves auth, vault
  encryption, ownership, contacts, rate limiting and revocation — not Telegram
  itself.
