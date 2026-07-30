# HookIn real application

Next.js + Vercel API routes + Neon Postgres.

## Local setup

1. Create a Neon database.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
3. Run the SQL in `db/schema.sql` in the Neon SQL editor.
4. Install dependencies and start the app:

```powershell
npm.cmd install
npm.cmd run dev
```

The app runs on `http://localhost:3200`.

## Vercel environment variables

Set these in Vercel Project Settings -> Environment Variables:

- `DATABASE_URL`: Neon pooled or direct connection string
- `HOOKIN_APP_URL`: production app URL, for example `https://your-domain.com`
- `HOOKIN_DEFAULT_PROJECT_NAME`: optional workspace display name
- `HOOKIN_ADMIN_USER`: dashboard username, defaults to `admin`
- `HOOKIN_ADMIN_PASSWORD`: dashboard password. If omitted, the dashboard is not password protected.

## Important Vercel note

Dashboard and admin APIs are protected with HTTP Basic Auth when `HOOKIN_ADMIN_PASSWORD` is set. Public webhook ingest routes under `/in/:endpointId` remain open for providers. Webhook ingest and immediate forwarding can run in Vercel route handlers. Scheduled retry processing should later use Vercel Cron or a queue provider such as Upstash/QStash because serverless functions should not run forever.
