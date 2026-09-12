import { requireSql } from "@/lib/db";
import { clientIp, sha256 } from "@/lib/security";

export class AuthRateLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterSeconds: number) {
    super("Too many attempts. Please wait before trying again.");
  }
}

export async function enforceAuthRateLimit(request: Request, action: string, options: { identifier?: string; limit: number; windowSeconds: number }) {
  const sql = requireSql();
  const normalized = options.identifier?.trim().toLowerCase() || clientIp(request);
  const identifierHash = sha256(`${action}:${normalized}`);
  const [row] = await sql`
    insert into auth_rate_limit_windows (action, identifier_hash, window_start, request_count)
    values (
      ${action},
      ${identifierHash},
      to_timestamp(floor(extract(epoch from now()) / ${options.windowSeconds}) * ${options.windowSeconds}),
      1
    )
    on conflict (action, identifier_hash, window_start)
    do update set request_count = auth_rate_limit_windows.request_count + 1
    returning request_count, extract(epoch from (window_start + (${options.windowSeconds} * interval '1 second') - now()))::int as retry_after
  `;
  if (Number(row.request_count) > options.limit) throw new AuthRateLimitError(Math.max(1, Number(row.retry_after || options.windowSeconds)));
}

export function authRateLimitResponse(error: unknown) {
  if (!(error instanceof AuthRateLimitError)) return null;
  return {
    status: error.status,
    body: { ok: false, error: error.message },
    headers: { "retry-after": String(error.retryAfterSeconds), "cache-control": "no-store" }
  };
}
