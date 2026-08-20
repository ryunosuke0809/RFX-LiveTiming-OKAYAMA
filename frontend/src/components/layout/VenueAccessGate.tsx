"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useVenueGeofence } from "@/hooks/useVenueGeofence";

/**
 * 一般向けホストでは GPS 場内判定が通るまで子コンポーネント（LiveTiming / WS）をマウントしない。
 * 関係者サブドメイン・localhost ではそのまま通す。
 *
 * 管理画面は場外から運用するため GPS を要求しない（到達可否は middleware とログインで守る）。
 */
export default function VenueAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, required, allowed, checking, message, recheck } = useVenueGeofence();
  const isAdminPage = pathname?.startsWith("/admin") ?? false;

  // ホスト判定前は一般向け扱い（誤って WS を先に繋がない）
  if (isAdminPage || (ready && (!required || allowed))) {
    return <>{children}</>;
  }

  const showRetry = ready && required && !allowed && !checking;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0c0c0f] px-6 text-center">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
        Okayama International Circuit
      </p>
      <p className="mb-2 max-w-md text-sm leading-relaxed text-zinc-300">
        {message ||
          "位置情報を確認しています。許可を求められたら「許可」を選んでください。"}
      </p>
      <p className="mb-8 max-w-md text-xs leading-relaxed text-zinc-500">
        Live Timing is available only inside Okayama International Circuit.
        Location access is required.
      </p>
      {showRetry ? (
        <button
          type="button"
          onClick={recheck}
          className="rounded border border-zinc-600 bg-zinc-900 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-zinc-100 transition hover:border-zinc-400 hover:bg-zinc-800"
        >
          再試行 / Retry
        </button>
      ) : (
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400"
          aria-hidden
        />
      )}
    </div>
  );
}
