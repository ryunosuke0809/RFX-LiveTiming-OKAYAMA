"use client";

import Image from "next/image";
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
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          <Image
            src="/images/okayama-logo.png"
            alt="Okayama International Circuit"
            width={140}
            height={32}
            className="hidden sm:block object-contain h-6 w-auto"
            priority
          />
          <Image
            src="/images/mola-logo.png"
            alt="MOLA System Engineering"
            width={80}
            height={28}
            className="object-contain h-5 sm:h-6 w-auto invert brightness-90"
            priority
          />
        </div>
      </div>

      {/* 下段: 残り時間 + フラグ (左) ... 現在時刻 (右) */}
      <div className="flex items-end justify-between px-3 sm:px-5 py-3 sm:py-5">
        <div className="flex items-center gap-3">
          <div className="font-bold font-mono text-white tracking-wider leading-none"
            style={{ fontSize: "var(--timing-fs-xl)" }}>
            {formatRemainingTime(remainingTime)}
          </div>
          {/* FLAG — 一時的にコメントアウト
          <TrackStatus flag={flag} />
          */}
        </div>

        {/* セッション名 (モバイル) */}
        <div className="sm:hidden flex-1 text-center px-2 min-w-0">
          <span className="text-zinc-400 uppercase tracking-wider leading-none"
            style={{ fontSize: "var(--timing-fs-sm)" }}>
            {session.nameE}
          </span>
        </div>

        <div className="font-bold font-mono text-emerald-400 tracking-wider leading-none"
          style={{ fontSize: "var(--timing-fs-xl)" }}>
          {localTime}
        </div>
      </div>
    </header>
  );
}
