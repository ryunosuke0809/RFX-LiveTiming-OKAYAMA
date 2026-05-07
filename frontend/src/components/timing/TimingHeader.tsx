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
    <header className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 border-b border-zinc-700">
      {/* 左: 残り時間 */}
      <div className="flex items-center gap-4">
        <div className="text-4xl font-bold font-mono text-white tracking-wider leading-none">
          {formatRemainingTime(remainingTime)}
        </div>
        <TrackStatus flag={flag} />
      </div>

      {/* 中央: イベント名・セッション名 */}
      <div className="flex-1 text-center px-6">
        <div className="text-xs text-zinc-400 uppercase tracking-widest leading-none">
          {competition.nameE}
        </div>
        <div className="text-sm font-semibold text-white mt-1 leading-none">
          {session.nameE}
        </div>
      </div>

      {/* 右: ロゴ・時刻 */}
      <div className="flex items-center gap-5 text-right">
        <div className="flex flex-col items-end leading-none">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
            Okayama International Circuit
          </span>
          <span className="text-xs font-bold text-zinc-300 tracking-wider mt-0.5">
            MOLA
          </span>
        </div>
        <div className="text-xl font-mono text-emerald-400 tabular-nums leading-none">
          {localTime}
        </div>
      </div>
    </header>
  );
}
