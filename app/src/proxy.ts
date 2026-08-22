import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

const pageSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://va.vercel-scripts.com",
  "connect-src 'self' https://*.razorpay.com https://vitals.vercel-insights.com",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join("; ");

const embedSecurityPolicy = pageSecurityPolicy.replace("frame-ancestors 'none'", "frame-ancestors https:");

function secure(response: NextResponse, embedded: boolean) {
  response.headers.set("Content-Security-Policy", embedded ? embedSecurityPolicy : pageSecurityPolicy);
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(self)");
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (!embedded) response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export function proxy(request: NextRequest) {
  const embedded = request.nextUrl.pathname.startsWith("/embed/");
  if (request.nextUrl.pathname.startsWith("/dashboard") && !request.cookies.get(SESSION_COOKIE)?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return secure(NextResponse.redirect(loginUrl), false);
  }
  return secure(NextResponse.next(), embedded);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"]
};
