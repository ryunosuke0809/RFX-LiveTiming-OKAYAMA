import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminHosts, allowsAdminPages } from "@/lib/accessControl";

/**
 * ホスト単位でページを閉じる／振り分ける。
 *
 * - `/debug`: 本番ではデバッグ用ストリームビューアを閉じる（next dev では許可）。
 * - `/admin`: 管理ホスト（`accessControl.ts` の `adminHosts()`）とローカル開発のみ。
 *   一般公開ドメインに管理画面が露出しないようにする。
 * - 管理ホストの公開ページ（`/` など）は管理画面へ送る。localhost は対象外。
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = requestHostname(request);

  if (adminHosts().has(host) && isPublicAppPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  if (process.env.NODE_ENV === "production" && pathname.startsWith("/debug")) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  if (pathname.startsWith("/admin") && !allowsAdminPages(host)) {
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  return NextResponse.next();
}

/** 管理サブドメインでは Live / Tracking 等を出さず管理画面へ送るパス。 */
function isPublicAppPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return ["/tracking", "/result", "/about", "/schedule"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
  matcher: [
    "/",
    "/tracking",
    "/tracking/:path*",
    "/result",
    "/result/:path*",
    "/about",
    "/about/:path*",
    "/schedule",
    "/schedule/:path*",
    "/debug/:path*",
    "/admin",
    "/admin/:path*",
  ],
};
