"use client";

import type { SessionInfo } from "@/types/smis";
import TrackStatus from "./TrackStatus";
import { formatRemainingTime } from "@/lib/format";

interface TimingHeaderProps {
  sessionInfo: SessionInfo;
}

export default function TimingHeader({ sessionInfo }: TimingHeaderProps) {
  const { competition, session, flag, remainingTime, localTime } = sessionInfo;

  return (
    <header className="bg-zinc-900 border-b border-zinc-700">
      {/* 上段: イベント名 + セッション名 (左) ... サーキット名 + MOLA (右) */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-0.5 sm:py-1 border-b border-zinc-800/50">
        <div className="flex items-center gap-2 min-w-0 leading-none"
          style={{ fontSize: "var(--timing-fs-sm)" }}>
          <span className="text-zinc-300 uppercase tracking-wider truncate">
            {competition.nameE}
          </span>
          <span className="text-zinc-600 hidden sm:inline">|</span>
          <span className="text-zinc-400 uppercase tracking-wider hidden sm:inline whitespace-nowrap">
            {session.nameE}
          </span>
        </div>
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0 leading-none"
          style={{ fontSize: "var(--timing-fs-sm)" }}>
          {/* 将来的に <img> ロゴに差替え */}
          <span className="text-zinc-500 uppercase tracking-wider hidden sm:inline whitespace-nowrap">
            Okayama International Circuit
          </span>
          <span className="font-bold text-zinc-300 uppercase tracking-wider whitespace-nowrap">
            MOLA
          </span>
        </div>
      </div>

      {/* 下段: 残り時間 + フラグ (左) ... 現在時刻 (右) */}
      <div className="flex items-end justify-between px-3 sm:px-5 py-1 sm:py-1.5">
        <div className="flex flex-col gap-0.5">
          <div className="font-bold font-mono text-white tracking-wider leading-none"
            style={{ fontSize: "var(--timing-fs-xl)" }}>
            {formatRemainingTime(remainingTime)}
          </div>
          <TrackStatus flag={flag} />
        </div>

        {/* セッション名 (モバイル) */}
        <div className="sm:hidden flex-1 text-center px-2 min-w-0">
          <span className="text-zinc-400 uppercase tracking-wider leading-none"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            {session.nameE}
          </span>
        </div>

        <div className="font-mono text-emerald-400 tabular-nums font-bold leading-none"
          style={{ fontSize: "var(--timing-fs-lg)" }}>
          {localTime}
        </div>
      </div>
    </header>
  );
}
