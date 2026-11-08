import { NextResponse, type NextRequest } from "next/server";

import { isPublicTotePath } from "@/lib/public-path";
import { openSession, sessionCookieName } from "@/lib/session";

function continueWithPath(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await openSession(request.cookies.get(sessionCookieName)?.value);

  if (pathname === "/login") {
    const reauth = request.nextUrl.searchParams.get("reauth") === "1";
    if (session && !reauth) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return continueWithPath(request);
  }

  if (isPublicTotePath(pathname)) {
    const response = continueWithPath(request);
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return continueWithPath(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
