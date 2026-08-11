# PayloadGrid

PayloadGrid is a multi-tenant inbound and outbound webhook platform for SaaS, commerce, and developer teams worldwide. The application uses Next.js on Vercel, Neon Postgres, and Upstash QStash for durable delivery jobs.

Documentation:

- [Platform guide](docs/PLATFORM_GUIDE.md): concepts, dashboard modules, configuration examples, event flows, operations, and troubleshooting
- [Architecture](docs/ARCHITECTURE.md): tenant boundaries, delivery sequences, and runtime topology
- [Production readiness](docs/PRODUCTION_READINESS.md): implemented controls, validation gates, and external infrastructure work

## Implemented

- Email/password and optional Google and GitHub accounts, email verification, password reset, secure HTTP-only sessions
- Organizations, roles, projects, applications, team invitations, and tenant-scoped queries
- Scoped, hashed API keys, idempotent single and batch message acceptance, event subscriptions, and transformations
- Transactional database outbox, asynchronous QStash publication, stale-job recovery, and atomic worker claiming
- Automatic retry scheduling, manual replay, complete attempt capture, and failure alerts
- Razorpay, Cashfree, Stripe, and Shopify raw-body signature verification
- AES-256-GCM encryption for provider verification secrets and destination authorization headers
- HMAC-SHA256 signing for PayloadGrid outbound delivery
- HTTPS enforcement, private-address SSRF checks, payload limits, rate limits, and duplicate protection
- Three-day payload retention with scheduled redaction
- Public documentation, OpenAPI description, pricing, security, privacy, terms, contact, status, and no-signup playground
- Published npm CLI (`payloadgrid-cli`), TypeScript SDK (`@payloadgrid/sdk`), Python SDK (`payloadgrid`), and React embed package (`@payloadgrid/react`)

## Local setup

1. Copy `app/.env.example` to `app/.env.local`.
2. Set `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `PAYLOADGRID_APP_URL`, `CRON_SECRET`, and `PAYLOADGRID_ENCRYPTION_KEY`.
3. Run the complete `app/db/schema.sql` file in the Neon SQL editor. It is idempotent and includes all current migrations.
4. Install and start:

```powershell
cd app
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3200`.

Generate encryption and cron secrets with Node.js:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use the base64 value for `PAYLOADGRID_ENCRYPTION_KEY` and the hex value for `CRON_SECRET`. Keep both stable; changing the encryption key makes stored provider secrets unreadable.

## Vercel and Neon

Set the Vercel Root Directory to `app`. Add these Production and Preview variables:

- `DATABASE_URL`: Neon pooled connection string
- `NEXT_PUBLIC_SITE_URL`: canonical public URL without a trailing slash (`https://payloadgrid.com` in production)
- `GOOGLE_SITE_VERIFICATION`: optional Search Console HTML-tag verification value
- `PAYLOADGRID_APP_URL`: same public URL for server-generated links and queue callbacks (`https://payloadgrid.com` in production)
- `NEXT_PUBLIC_SUPPORT_EMAIL`: public support address
- `PAYLOADGRID_ENCRYPTION_KEY`: stable 32-byte base64 or 64-character hex key
- `CRON_SECRET`: independent random secret for protected maintenance and monitoring routes
- `PAYLOADGRID_OPERATOR_EMAILS`: comma-separated accounts allowed to manage platform incidents

Run `app/db/schema.sql` in Neon before deploying code that uses the new columns.

## OAuth sign-in

OAuth is optional and appears on the sign-in and signup pages only when a provider's complete environment configuration is present. Apply `db/schema.sql` before enabling any provider.

Register these exact production callback URLs:

```text
https://payloadgrid.com/api/auth/oauth/google/callback
https://payloadgrid.com/api/auth/oauth/github/callback
```

Then configure:

- Google: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- GitHub: `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

For local testing, register the corresponding `http://localhost:3200/api/auth/oauth/PROVIDER/callback` URL in a separate development app. Never prefix these server-only variables with `NEXT_PUBLIC_`.

PayloadGrid verifies provider identity tokens or verified email records, binds the provider's stable account ID to one user, and then issues the same PayloadGrid HTTP-only session used by password login. OAuth signup also creates the first workspace or accepts a matching pending invitation.

## Durable queue

Create an Upstash QStash account and add:

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

PayloadGrid commits each message, endpoint fan-out, and dispatch row in one database transaction. A dispatcher publishes those outbox rows to `/api/jobs/deliver`. The worker atomically claims each event, so QStash retries or stale-job recovery cannot process one attempt concurrently. Without QStash, the dispatcher can process jobs directly through Vercel `after`; the scheduled dispatcher remains required to recover work after an interrupted request.

Configure four protected schedules in QStash. For free-plan testing, run dispatch, retry recovery, and monitoring hourly to conserve message quota; production frequency must follow the measured recovery objective and QStash plan:

```text
GET https://YOUR_DOMAIN/api/cron/dispatch
Authorization: Bearer YOUR_CRON_SECRET
Schedule: hourly for free-plan testing

GET https://YOUR_DOMAIN/api/cron/retry-failed
Authorization: Bearer YOUR_CRON_SECRET
Schedule: hourly for free-plan testing

GET https://YOUR_DOMAIN/api/cron/maintenance
Authorization: Bearer YOUR_CRON_SECRET
Schedule: daily

GET https://YOUR_DOMAIN/api/cron/monitor
Authorization: Bearer YOUR_CRON_SECRET
Schedule: hourly for free-plan testing
```

The dispatch route publishes pending outbox rows and recovers missing or stale dispatch jobs. Retry recovery resets stale workers and performs the same outbox recovery. Maintenance redacts expired payloads, erases expired rotation secrets, removes expired operational records, and prunes raw service checks from 1,000 rows back to the newest 100. Monitoring records customer-facing service checks, opens an incident after three consecutive failures, and resolves it after two consecutive healthy checks.

## Transactional email

For verified new accounts and password reset, configure:

- `RESEND_API_KEY`
- `PAYLOADGRID_AUTH_FROM`: a verified sender such as `PayloadGrid <auth@your-domain.com>`

When these are absent, local password authentication remains available and new accounts are marked verified automatically. Add email configuration before inviting external users.

Optional alert variables:

- `PAYLOADGRID_ALERT_FROM`
- `RESEND_API_KEY`
- `PAYLOADGRID_INCIDENT_ALERT_TO`: comma-separated incident email recipients
- `PAYLOADGRID_INCIDENT_ALERT_WEBHOOK`: optional HTTPS incident notification destination

## Public API

```bash
curl -X POST https://YOUR_DOMAIN/api/v1/messages \
  -H "Authorization: Bearer pg_live_YOUR_KEY" \
  -H "Idempotency-Key: order_8921_completed" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "APPLICATION_UUID",
    "eventType": "order.completed",
    "payload": { "orderId": "8921", "status": "completed" }
  }'
```

A new message returns `202` with `status: "accepted"`. Final endpoint states are processed asynchronously and appear in the dashboard.

## Provider verification

When creating a Razorpay, Cashfree, Stripe, or Shopify endpoint, enter the corresponding provider webhook secret. PayloadGrid encrypts it before storage and rejects inbound events with missing, invalid, or expired signatures. Custom endpoints do not require provider verification.

## Validation

```powershell
cd app
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Before offering contractual reliability or regulated-data commitments, complete an independent security review, external monitoring history, legal review, queue load testing, backup recovery testing, SDK publication, usage billing, and customer validation.
