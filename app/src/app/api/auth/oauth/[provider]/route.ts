import { NextResponse } from "next/server";
import { isOAuthProvider, OAuthError, startOAuth } from "@/lib/oauth";
import { SITE_URL } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const requestUrl = new URL(request.url);
  if (!isOAuthProvider(provider)) return NextResponse.redirect(new URL("/login?error=oauth_provider_invalid", SITE_URL));
  try {
    const destination = await startOAuth(provider, {
      inviteToken: requestUrl.searchParams.get("invite") || undefined,
      returnTo: requestUrl.searchParams.get("next") || undefined
    });
    return NextResponse.redirect(destination);
  } catch (error) {
    const code = error instanceof OAuthError ? error.code : "oauth_failed";
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(code)}`, SITE_URL));
  }
}
