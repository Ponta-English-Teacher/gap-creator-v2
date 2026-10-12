import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Keeps teachers and students on the public production domain.
 *
 * Every Vercel deployment also has its own URL (e.g. gap-creator-abc123-....vercel.app).
 * Those URLs are protected (students get a Vercel login) and a teacher working there would
 * share links on that address. So a production deployment opened on any other host is
 * redirected to the public domain, keeping the path and query.
 * Preview deployments and local development are not affected.
 */
export function proxy(request: NextRequest) {
  const publicHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV !== "production" || !publicHost) return NextResponse.next();
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  if (!host || host === publicHost) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = publicHost;
  url.port = "";
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Pages only (teacher page and student pages); not API calls or static files.
  matcher: ["/((?!api/|_next/|favicon.ico).*)"],
};
