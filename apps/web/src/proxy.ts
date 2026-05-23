import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "taste.jaytel.com";
const AUTOMATION_PATHS = new Set(["/api/jobs/drain", "/api/cron/cleanup"]);

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();

  if (!host || host === CANONICAL_HOST || isLocalHost(host)) {
    return NextResponse.next();
  }

  if (host.endsWith(".vercel.app") && AUTOMATION_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (host.endsWith(".vercel.app")) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = CANONICAL_HOST;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}
