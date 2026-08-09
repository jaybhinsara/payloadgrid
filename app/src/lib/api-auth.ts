import { requireSql } from "@/lib/db";
import { sha256 } from "@/lib/security";

export type ApiScope = "messages:write" | "events:read";
export type ApiKeyContext = { keyId: string; projectId: string; organizationId: string; scopes: string[] };

export async function authenticateApiKey(request: Request, requiredScope?: ApiScope): Promise<ApiKeyContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  // Prefix-independent validation keeps previously issued keys usable after a rebrand.
  if (!/^[A-Za-z0-9_-]{32,96}$/.test(token)) return null;
  const sql = requireSql();
  const [key] = await sql`
    select k.id, k.project_id, k.scopes, p.organization_id
    from api_keys k
    join projects p on p.id = k.project_id
    where k.key_hash = ${sha256(token)}
      and k.revoked_at is null
      and (k.expires_at is null or k.expires_at > now())
    limit 1
  `;
  if (!key) return null;
  const scopes = Array.isArray(key.scopes) ? key.scopes.map(String) : [];
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("*")) return null;
  await sql`update api_keys set last_used_at = now() where id = ${key.id}`;
  return { keyId: String(key.id), projectId: String(key.project_id), organizationId: String(key.organization_id), scopes };
}
