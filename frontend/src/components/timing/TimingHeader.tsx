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
      {/* 上段: イベント名 | セッション名 ... ロゴエリア + 現在時刻 */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-0.5 sm:py-1 border-b border-zinc-800">
        <div className="text-zinc-400 uppercase tracking-wider truncate min-w-0 leading-none"
          style={{ fontSize: "var(--timing-fs-sm)" }}>
          {competition.nameE}
        </div>
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          <span className="text-zinc-400 uppercase tracking-wider hidden sm:inline leading-none"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            {session.nameE}
          </span>
        </div>
      </div>

      {/* 下段: 残り時間 + フラグ ... サーキット名 + MOLA + 時刻 */}
      <div className="flex items-center justify-between px-3 sm:px-5 py-1 sm:py-1.5">
        {/* 左: 残り時間 + フラグ */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <div className="font-bold font-mono text-white tracking-wider leading-none"
            style={{ fontSize: "var(--timing-fs-xl)" }}>
            {formatRemainingTime(remainingTime)}
          </div>
          <TrackStatus flag={flag} />
        </div>

        {/* 中央: セッション名 (モバイル用) */}
        <div className="sm:hidden flex-1 text-center px-2 min-w-0">
          <span className="text-zinc-400 uppercase tracking-wider truncate leading-none"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            {session.nameE}
          </span>
        </div>

        {/* 右: ロゴ + 時刻 */}
        <div className="flex items-center gap-3 sm:gap-5 flex-shrink-0">
          {/* ロゴ: 将来的に <img> に差替え */}
          <div className="hidden sm:flex items-center gap-4">
            <span className="text-zinc-500 uppercase tracking-wider font-medium leading-none"
              style={{ fontSize: "var(--timing-fs-sm)" }}>
              Okayama International Circuit
            </span>
            <span className="font-bold text-zinc-300 uppercase tracking-wider leading-none"
              style={{ fontSize: "var(--timing-fs-sm)" }}>
              MOLA
            </span>
          </div>
          <div className="font-mono text-emerald-400 tabular-nums font-bold leading-none"
            style={{ fontSize: "var(--timing-fs-lg)" }}>
            {localTime}
          </div>
        </div>
      </div>
    </header>
  );
}
