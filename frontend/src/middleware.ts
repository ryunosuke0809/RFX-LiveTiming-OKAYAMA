import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowsAdminPages } from "@/lib/accessControl";

/**
 * ホスト単位でページを閉じる。
 *
 * - `/debug`: 本番ではデバッグ用ストリームビューアを閉じる（next dev では許可）。
 * - `/admin`: 管理ホスト（`NEXT_PUBLIC_ADMIN_HOST`）とローカル開発のみ。
 *   一般公開ドメインに管理画面が露出しないようにする。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === "production" && pathname.startsWith("/debug")) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  if (pathname.startsWith("/admin") && !allowsAdminPages(requestHostname(request))) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  return NextResponse.next();
}

/**
 * リクエストが宛てられたホスト名。
 *
 * nextUrl.hostname は nginx から見た接続先（127.0.0.1）になるため使えない。
 * nginx は `proxy_set_header Host $host` で公開ホスト名を渡している。
 */
function requestHostname(request: NextRequest): string {
  const header = request.headers.get("host") ?? request.nextUrl.hostname;
  // IPv6 リテラル（[::1]:3000）を壊さないよう、末尾のポートだけを落とす
  return header.replace(/:\d+$/, "").toLowerCase();
}

export const config = {
  matcher: ["/debug/:path*", "/admin", "/admin/:path*"],
};
