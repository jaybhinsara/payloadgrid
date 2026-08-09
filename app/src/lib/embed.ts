import { createHmac, timingSafeEqual } from "node:crypto";

export type EmbedPermission = "deliveries:read" | "deliveries:replay";
export type EmbedClaims = { projectId: string; applicationId: string; permissions: EmbedPermission[]; exp: number };

function secret() {
  const value = process.env.PAYLOADGRID_EMBED_SECRET || process.env.PAYLOADGRID_ENCRYPTION_KEY;
  if (!value) throw new Error("PAYLOADGRID_EMBED_SECRET is not configured");
  return value;
}

export function createEmbedToken(claims: EmbedClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyEmbedToken(token: string): EmbedClaims | null {
  try {
    const [payload, provided] = token.split(".");
    if (!payload || !provided) return null;
    const expected = createHmac("sha256", secret()).update(payload).digest();
    const actual = Buffer.from(provided, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as EmbedClaims;
    if (!claims.projectId || !claims.applicationId || claims.exp <= Math.floor(Date.now() / 1000)) return null;
    claims.permissions = Array.isArray(claims.permissions) ? claims.permissions : ["deliveries:read"];
    return claims;
  } catch { return null; }
}
