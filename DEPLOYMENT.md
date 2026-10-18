# Deployment

Open Personal Agent ships as a single Node process serving the API and the
client. The datastore is **SQLite by default** (zero dependencies, good for a
self-hosted single user) and **PostgreSQL when `DATABASE_URL` is set**
(recommended for the public multi-user deployment).

## 1. Database

### Option A — Neon (serverless Postgres, recommended)

1. Create a project at [neon.tech](https://neon.tech) → copy the pooled
   connection string.
2. Set `DATABASE_URL=postgres://user:pass@host/db?sslmode=require`.

Tables are created automatically at boot (`CREATE TABLE IF NOT EXISTS`) — there
is no separate migration step yet. The driver translates the app's SQL to
PostgreSQL at runtime; SQLite remains the dev/eval path.

### Option B — fly postgres or any managed Postgres

Any `DATABASE_URL` pointing at Postgres 14+ works. `pg` `Pool` is used with
`ssl: { rejectUnauthorized: false }` when the URL contains `sslmode=require`.

### Option C — SQLite (self-hosted single user)

Don't set `DATABASE_URL`. Set `OPA_DB_PATH=/data/opa.db` and mount a volume at
`/data`. On Fly: `fly volumes create opa_data --size 1` and uncomment the
`[mounts]` block in `app/fly.toml`.

## 2. Fly.io

```bash
fly launch --no-deploy          # reads app/fly.toml
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  MASTER_KEY=$(openssl rand -hex 32) \
  DATABASE_URL=postgres://... \
  OPA_MULTI_USER=1 \
  PUBLIC_BASE_URL=https://your-app.fly.dev
fly deploy                    # build context is the repo root
```

`MASTER_KEY` encrypts users' BYOK model keys (AES-256-GCM) and signs auth
tokens. Generate it once, store it in `fly secrets`, and never rotate it
without a re-encryption migration.

## 3. docker compose (local prod-shaped stack)

```bash
cd app
docker compose up --build     # app + postgres:16, http://localhost:5000
```

Compose sets `DATABASE_URL` to the bundled Postgres and `OPA_MULTI_USER=1`.
Override via shell env or an `app/.env` file.

## 4. Channels

### SMS (Twilio)

1. Buy a number → configure the **Messaging webhook**:
   `POST https://your-domain/api/channels/sms`.
2. `fly secrets set TWILIO_AUTH_TOKEN=... PUBLIC_BASE_URL=https://your-domain`.
3. Each user adds their phone under **Settings → Channels** (OTP-verified).
   Inbound texts resolve the account by the `From` number.
4. Outbound replies need `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` +
   `TWILIO_FROM_NUMBER`; without them outbound SMS is simulated (logged).
   US numbers need A2P 10DLC registration for delivery — start early.

### Email (Mailgun inbound + Resend/SMTP outbound)

- **Inbound**: Mailgun route → `POST https://your-domain/api/channels/email`
  with header `x-opa-email-token=$EMAIL_CHANNEL_SECRET`, or native Mailgun
  signing with `MAILGUN_SIGNING_KEY`. Users are routed by their per-user agent
  address `agent+<token>@<inbound-domain>` shown under Settings → Channels.
- **Outbound**: `RESEND_API_KEY` + `EMAIL_FROM`, or `SMTP_URL`. Without them,
  outbound mail is written to the outbox (simulated).
- Untrusted senders land in the recipient's inbox as tainted content — they
  never execute commands.

## 5. Provider connections

Every provider is optional; missing ones fall back to clearly-labeled sample data.

### Google (real Calendar + Gmail per user)

1. Google Cloud Console → create a project, enable **Google Calendar API** and **Gmail API**.
2. OAuth consent screen → External → add scopes: `calendar.events`, `gmail.readonly`, `gmail.compose`, `gmail.send`, `openid`, `email`. (Unverified apps show a warning screen users can click through; publish the app for the general public.)
3. Credentials → OAuth client ID (Web) → authorized redirect URI:
   `https://your-domain/api/connect/google/callback`.
4. `fly secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...` (`PUBLIC_BASE_URL` already set).
5. Users connect under **Settings → Connections**. Refresh tokens are encrypted with `MASTER_KEY` in `user_keys`; revoking access at myaccount.google.com or **Disconnect** cleans up.

### Duffel (live flights) — `DUFFEL_API_KEY`

Test tokens (`duffel_test_*`) run identical code against sandbox inventory.
Live orders additionally need per-user settings `passenger_given_name`,
`passenger_family_name`, `passenger_born_on` (orders are rejected with a clear
message if unset) and a funded Duffel Balance for `type: "balance"` payments.

### Lithic (real single-use cards) — `LITHIC_API_KEY`

Sandbox keys work end-to-end. `LITHIC_BASE_URL` overrides the API host.
Cards are issued `SINGLE_USE` with `spend_limit = approved amount` — the model
never sees a PAN, only the token ref + last4.

## 6. Required environment

| Var | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Platform model key (users can add their own via BYOK) |
| `MASTER_KEY` | AES-256 key-encryption key + auth-token signer (`openssl rand -hex 32`) |
| `PUBLIC_BASE_URL` | External URL — magic links, Twilio signature checks, OAuth redirect |
| `DATABASE_URL` | Postgres; omit for SQLite |
| `OPA_MULTI_USER=1` | Enable accounts/channels/BYOK (omit for single-user) |
| `TWILIO_*`, `EMAIL_*`, `MAILGUN_*`, `RESEND_API_KEY`/`SMTP_URL` | Channels |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Per-user Google Calendar + Gmail |
| `DUFFEL_API_KEY`, `LITHIC_API_KEY` | Live flights, real cards |
| `ELEVENLABS_API_KEY` (+ `ELEVENLABS_VOICE`) | Server-side TTS for spoken replies |

Rate limits: `/api/auth/*` → 20 req/10 min per IP; `/api/messages` + channel
webhooks → 30 req/min per IP. Security headers (CSP, HSTS, nosniff,
frame-deny) are set on every response — both live in `server/security.ts`.
