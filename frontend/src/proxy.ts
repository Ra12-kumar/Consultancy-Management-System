import { NextResponse, type NextRequest } from "next/server";

// Sends visitors without a session cookie to the sign-in page before the student, counsellor or admin areas load.
// This is only a convenience: the backend checks the session, role and permissions on every request.
export function proxy(request: NextRequest) {
  if (request.cookies.has("ec_sid")) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/student/:path*", "/admin/:path*", "/counsellor/:path*"],
};
