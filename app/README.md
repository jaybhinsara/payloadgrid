# PayloadGrid

Multi-tenant webhook infrastructure built with Next.js, Vercel route handlers, and Neon Postgres.

## What is implemented

- Email/password accounts with scrypt password hashing and secure 30-day HTTP-only sessions
- Organizations, role-based members, projects, applications, and tenant-scoped queries
- Joinable organization invitation links
- Outbound message API with hashed API keys and idempotency keys
- Application endpoints with event subscriptions and endpoint-specific HMAC secrets
- Inbound provider gateway at `/in/:endpointId`
- Outbound fan-out, response capture, exponential retries, replay, and delivery inspection
- Razorpay, Stripe, Cashfree, Shopify, and custom provider metadata
- Payload transformations, event types, alerts, audit logs, and revenue-at-risk metrics
- Slack/custom-webhook alerts plus email alerts through Resend
- Responsive marketing site, signup/login, and operational console

## Local setup

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL` and `CRON_SECRET`. Set the site URL variables when you need a non-local public URL.
2. Run the complete `db/schema.sql` file in the Neon SQL editor. It is idempotent and upgrades the earlier PayloadGrid prototype tables.
3. Install dependencies and start the application:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3200`, create an account, then create an endpoint and API key in the console.

## Vercel setup

Set the Vercel Root Directory to `app`. Add these Production and Preview environment variables:

- `DATABASE_URL`: Neon pooled connection string
- `NEXT_PUBLIC_SITE_URL`: your canonical public URL, for example `https://payloadgrid.com`
- `PAYLOADGRID_APP_URL`: optional server-side URL override; Vercel deployment URLs are detected automatically
- `CRON_SECRET`: long random secret used by retry processing
- `RESEND_API_KEY`: optional, only for email alerts
- `PAYLOADGRID_ALERT_FROM`: optional verified sender, only for email alerts

The repository intentionally does not register a frequent Vercel cron in `vercel.json`, because Vercel Hobby only supports daily cron jobs. Use an external scheduler to call this route every 1-5 minutes:

```text
GET https://your-domain.com/api/cron/retry-failed
Authorization: Bearer YOUR_CRON_SECRET
```

## Send an outbound webhook

Create an application, endpoint, and API key in the console, then call:

```bash
curl -X POST https://your-domain.com/api/v1/messages \
  -H "Authorization: Bearer pg_live_YOUR_KEY" \
  -H "Idempotency-Key: order_8921_completed" \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "YOUR_APPLICATION_UUID",
    "eventType": "order.completed",
    "payload": { "orderId": "8921", "status": "completed" }
  }'
```

The call returns `202` after immediate delivery attempts are recorded. Failed attempts enter the retry queue.

## Verify a PayloadGrid signature

Every signed delivery contains:

- `payloadgrid-id`: delivery event UUID
- `payloadgrid-timestamp`: Unix timestamp
- `payloadgrid-signature`: `v1,<base64 HMAC-SHA256>`

Calculate HMAC-SHA256 over `${payloadgrid-id}.${payloadgrid-timestamp}.${rawRequestBody}` using the endpoint signing secret, base64-encode it, and compare it with the value after `v1,`. Also reject old timestamps to prevent replay attacks.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run build
```

## Production boundaries

PayloadGrid now has a real multi-tenant SaaS foundation and working delivery workflows. Before charging external customers, complete an independent security review, add email verification/password reset, connect usage metering and billing, move high-volume delivery/retries to a durable queue, and add provider-specific inbound signature verification.