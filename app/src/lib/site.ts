const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PAYLOADGRID_APP_URL ||
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3200")
).replace(/\/$/, "");