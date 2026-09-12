import { clientIp } from "@/lib/security";

export const PLAYGROUND_LIFETIME_MINUTES = 30;
export const PLAYGROUND_MAX_REQUESTS = 20;
export const PLAYGROUND_MAX_BODY_BYTES = 64 * 1024;
export const PLAYGROUND_MAX_INBOXES_PER_HOUR = 10;

const SAFE_REQUEST_HEADERS = new Set([
  "accept",
  "content-type",
  "idempotency-key",
  "razorpay-signature",
  "stripe-signature",
  "svix-id",
  "svix-signature",
  "svix-timestamp",
  "user-agent",
  "x-event-type",
  "x-hub-signature",
  "x-hub-signature-256",
  "x-request-id",
  "x-signature",
  "x-webhook-event",
]);

export const getClientIp = clientIp;

export function safePlaygroundHeaders(headers: Headers) {
  return Object.fromEntries(
    [...headers.entries()].filter(([name]) => SAFE_REQUEST_HEADERS.has(name.toLowerCase())),
  );
}

export function isValidPlaygroundToken(token: string) {
  return /^[A-Za-z0-9_-]{24,80}$/.test(token);
}

export const PLAYGROUND_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": "*",
};
