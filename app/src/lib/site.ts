const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.PAYLOADGRID_APP_URL ||
  (vercelHost ? `https://${vercelHost}` : "http://localhost:3200")
).replace(/\/$/, "");
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@payloadgrid.com";
export const PRIVACY_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_EMAIL || SUPPORT_EMAIL;
export const LEGAL_OPERATOR_NAME = process.env.NEXT_PUBLIC_LEGAL_OPERATOR_NAME || "PayloadGrid";
