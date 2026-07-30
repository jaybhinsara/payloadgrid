import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PREFIXES = ["/in/", "/api/cron/", "/_next/", "/favicon.ico"];

function isPublicPath(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="HookIn Dashboard", charset="UTF-8"'
    }
  });
}

function verifyBasicAuth(header: string | null) {
  const password = process.env.HOOKIN_ADMIN_PASSWORD;
  if (!password) return true;

  const expectedUser = process.env.HOOKIN_ADMIN_USER || "admin";
  if (!header?.startsWith("Basic ")) return false;

  try {
    const decoded = atob(header.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;
    const username = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    return username === expectedUser && suppliedPassword === password;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!verifyBasicAuth(request.headers.get("authorization"))) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
