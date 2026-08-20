import { after } from "next/server";
import { requireSql } from "@/lib/db";
import { planLimits } from "@/lib/limits";
import { sha256 } from "@/lib/security";

export type ApiScope = "messages:write" | "events:read" | "embeds:write";
export type ApiKeyContext = {
  keyId: string;
  projectId: string;
  organizationId: string;
  scopes: string[];
  apiRequestsPerMinute: number;
  messagesPerMonth: number;
};

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_TRACKED_KEYS = 5_000;
const lastUsedWrites = new Map<string, number>();

function recordLastUsed(keyId: string) {
  const now = Date.now();
  if (now - (lastUsedWrites.get(keyId) || 0) < LAST_USED_WRITE_INTERVAL_MS) return;
  if (lastUsedWrites.size >= MAX_TRACKED_KEYS) lastUsedWrites.delete(lastUsedWrites.keys().next().value!);
  lastUsedWrites.set(keyId, now);
  after(async () => {
    try {
      await requireSql()`update api_keys set last_used_at = now() where id = ${keyId}`;
    } catch (error) {
      lastUsedWrites.delete(keyId);
      console.error("API key activity update failed", error);
    }
  });
}

export async function authenticateApiKey(request: Request, requiredScope?: ApiScope): Promise<ApiKeyContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  // Prefix-independent validation keeps previously issued keys usable after a rebrand.
  if (!/^[A-Za-z0-9_-]{32,96}$/.test(token)) return null;
  const sql = requireSql();
  const [key] = await sql`
    select k.id, k.project_id, k.scopes, p.organization_id, o.plan,
      case when o.temporary_limit_expires_at > now() then o.temporary_message_limit else null end as temporary_message_limit
    from api_keys k
    join projects p on p.id = k.project_id
    join organizations o on o.id = p.organization_id
    where k.key_hash = ${sha256(token)}
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
      and o.suspended_at is null
    limit 1
  `;
  if (!key) return null;
  const scopes = Array.isArray(key.scopes) ? key.scopes.map(String) : [];
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("*")) return null;
  const limits = planLimits(String(key.plan || "free"));
  const keyId = String(key.id);
  recordLastUsed(keyId);
  return {
    keyId,
    projectId: String(key.project_id),
    organizationId: String(key.organization_id),
    scopes,
    apiRequestsPerMinute: limits.apiRequestsPerMinute,
    messagesPerMonth: key.temporary_message_limit ? Number(key.temporary_message_limit) : limits.messagesPerMonth
  };
}
