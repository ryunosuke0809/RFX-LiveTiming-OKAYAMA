import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 本番ではデバッグ用ストリームビューアを閉じる。
 * 開発 (next dev) では /debug をそのまま許可。
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production" && request.nextUrl.pathname.startsWith("/debug")) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/debug/:path*"],
};
