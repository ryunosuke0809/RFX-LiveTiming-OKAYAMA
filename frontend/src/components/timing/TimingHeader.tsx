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
    <header className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-700">
      {/* 左: 残り時間 */}
      <div className="flex items-center gap-4">
        <div className="text-3xl font-bold font-mono text-white tracking-wider">
          {formatRemainingTime(remainingTime)}
        </div>
        <TrackStatus flag={flag} />
      </div>

      {/* 中央: イベント名・セッション名 */}
      <div className="flex-1 text-center px-4">
        <div className="text-xs text-zinc-400 uppercase tracking-widest">
          {competition.nameE}
        </div>
        <div className="text-sm font-semibold text-white mt-0.5">
          {session.nameE}
        </div>
      </div>

      {/* 右: ロゴ・時刻 */}
      <div className="flex items-center gap-4 text-right">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Okayama International Circuit
          </span>
          <span className="text-xs font-bold text-zinc-300 tracking-wider">
            MOLA
          </span>
        </div>
        <div className="text-lg font-mono text-emerald-400 tabular-nums">
          {localTime}
        </div>
      </div>
    </header>
  );
}
