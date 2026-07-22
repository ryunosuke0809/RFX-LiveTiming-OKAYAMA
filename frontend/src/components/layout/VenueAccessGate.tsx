"use client";

import type { ReactNode } from "react";
import { useVenueGeofence } from "@/hooks/useVenueGeofence";

/**
 * 一般向けホストでは GPS 場内判定が通るまで子コンポーネント（LiveTiming / WS）をマウントしない。
 * 関係者サブドメイン・localhost ではそのまま通す。
 *
 * 範囲外に出た場合は子をアンマウントして WebSocket を切断する。
 */
export default function VenueAccessGate({ children }: { children: ReactNode }) {
  const { ready, required, allowed, status, checking, message, recheck } = useVenueGeofence();

  if (!ready) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0c0c0f] px-6 text-center">
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          Okayama International Circuit
        </p>
        <div
          className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400"
          aria-hidden
        />
        <p className="text-sm text-zinc-300">読み込み中…</p>
      </div>
    );
  }

  if (!required || allowed) {
    return <>{children}</>;
  }

  const isChecking = checking || status === "prompting" || status === "idle";

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#0c0c0f] px-6 text-center">
      <p className="mb-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
        Okayama International Circuit
      </p>
      <p className="mb-2 max-w-md text-sm leading-relaxed text-zinc-300">{message}</p>
      <p className="mb-8 max-w-md text-xs leading-relaxed text-zinc-500">
        Live Timing is available only inside Okayama International Circuit.
        Location access is required.
      </p>
      {isChecking ? (
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400"
          aria-hidden
        />
      ) : (
        <button
          type="button"
          onClick={recheck}
          className="rounded border border-zinc-600 bg-zinc-900 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-zinc-100 transition hover:border-zinc-400 hover:bg-zinc-800"
        >
          再試行 / Retry
        </button>
      )}
    </div>
  );
}
