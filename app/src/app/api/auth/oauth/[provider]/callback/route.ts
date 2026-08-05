import { NextResponse } from "next/server";
import { createSession, setActiveOrganization } from "@/lib/auth";
import { completeOAuth, isOAuthProvider, OAuthError } from "@/lib/oauth";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorRedirect(code: string) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, SITE_URL), 303);
}

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  if (!isOAuthProvider(provider)) return errorRedirect("oauth_provider_invalid");
  const values = new URL(request.url).searchParams;
  if (values.get("error")) return errorRedirect("oauth_cancelled");
  const code = values.get("code");
  const state = values.get("state");
  if (!code || !state) return errorRedirect("oauth_callback_invalid");

  try {
    const result = await completeOAuth(provider, { code, state });
    await createSession(result.userId);
    if (result.organizationId) await setActiveOrganization(result.organizationId);
    return NextResponse.redirect(new URL(result.returnTo, SITE_URL), 303);
  } catch (error) {
    console.error("OAuth callback failed", provider, error instanceof Error ? error.message : error);
    return errorRedirect(error instanceof OAuthError ? error.code : "oauth_failed");
  }
}
