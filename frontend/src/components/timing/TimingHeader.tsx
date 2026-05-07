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
        <div className="font-bold font-mono text-white tracking-wider leading-none"
          style={{ fontSize: "var(--timing-fs-xl)" }}>
          {formatRemainingTime(remainingTime)}
        </div>
        <TrackStatus flag={flag} />
      </div>

      {/* 中央: イベント名・セッション名 */}
      <div className="flex-1 text-center px-6">
        <div className="text-zinc-400 uppercase tracking-widest leading-none"
          style={{ fontSize: "var(--timing-fs-sm)" }}>
          {competition.nameE}
        </div>
        <div className="font-semibold text-white mt-1 leading-none"
          style={{ fontSize: "var(--timing-fs)" }}>
          {session.nameE}
        </div>
      </div>

      {/* 右: ロゴ・時刻 */}
      <div className="flex items-center gap-5 text-right">
        <div className="flex flex-col items-end leading-none">
          <span className="text-zinc-500 uppercase tracking-wider"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            Okayama International Circuit
          </span>
          <span className="font-bold text-zinc-300 tracking-wider mt-0.5"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            MOLA Timing System
          </span>
        </div>
        <div className="font-mono text-emerald-400 tabular-nums leading-none"
          style={{ fontSize: "var(--timing-fs-lg)" }}>
          {localTime}
        </div>
      </div>
    </header>
  );
}
