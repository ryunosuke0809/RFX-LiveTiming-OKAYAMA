"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { SessionInfo } from "@/types/smis";
import TrackStatus from "./TrackStatus";
import { formatRemainingTime } from "@/lib/format";

interface TimingHeaderProps {
  sessionInfo: SessionInfo;
  /** ライブ: セッション開始からの経過秒 (データ時刻基準)。指定時に経過/残時間を出す。 */
  elapsedSec?: number | null;
  /** セッション総時間(秒)。>0 なら残時間カウントダウン、0/未指定なら経過時間。 */
  durationSec?: number;
  /** リーダーの周回数。 */
  leaderLap?: number;
  /** 総周回数 (>0 で "n/max" 表示)。 */
  maxLaps?: number;
  /** ライブデータ受信中か。 */
  isLive?: boolean;
}

export default function TimingHeader({
  sessionInfo,
  elapsedSec = null,
  durationSec = 0,
  leaderLap = 0,
  maxLaps = 0,
  isLive = false,
}: TimingHeaderProps) {
  const { competition, session, flag, remainingTime, localTime } = sessionInfo;

  // データ更新の合間も秒が進むよう、受信した経過秒を基準にローカルで補間する。
  const [tick, setTick] = useState(0);
  const baseRef = useRef<{ elapsed: number; at: number }>({ elapsed: 0, at: Date.now() });
  useEffect(() => {
    if (elapsedSec !== null) baseRef.current = { elapsed: elapsedSec, at: Date.now() };
  }, [elapsedSec]);
  useEffect(() => {
    if (!isLive || elapsedSec === null) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [isLive, elapsedSec]);

  let bigTime: string;
  let timeLabel = "";
  if (isLive && elapsedSec !== null) {
    void tick;
    const interpolated =
      baseRef.current.elapsed + Math.floor((Date.now() - baseRef.current.at) / 1000);
    if (durationSec > 0) {
      bigTime = formatRemainingTime(Math.max(0, durationSec - interpolated));
      timeLabel = "REMAINING";
    } else {
      bigTime = formatRemainingTime(interpolated);
      timeLabel = "ELAPSED";
    }
  } else {
    bigTime = formatRemainingTime(remainingTime);
  }

  const lapText =
    isLive && leaderLap > 0
      ? maxLaps > 0
        ? `LAP ${leaderLap}/${maxLaps}`
        : `LAP ${leaderLap}`
      : null;

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

      {/* 下段: 残り/経過時間 + 周回 (左) ... 現在時刻 (右) */}
      <div className="flex items-end justify-between px-3 sm:px-5 py-3 sm:py-5">
        <div className="flex items-end gap-3 sm:gap-4">
          <div className="flex flex-col">
            {timeLabel && (
              <span className="text-zinc-500 uppercase tracking-widest leading-none mb-1"
                style={{ fontSize: "var(--timing-fs-sm)" }}>
                {timeLabel}
              </span>
            )}
            <div className="font-bold font-mono text-white tracking-wider leading-none"
              style={{ fontSize: "var(--timing-fs-xl)" }}>
              {bigTime}
            </div>
          </div>
          {lapText && (
            <div className="flex flex-col">
              <span className="text-zinc-500 uppercase tracking-widest leading-none mb-1"
                style={{ fontSize: "var(--timing-fs-sm)" }}>
                LAPS
              </span>
              <div className="font-bold font-mono text-emerald-400 tracking-wider leading-none"
                style={{ fontSize: "var(--timing-fs-lg)" }}>
                {lapText.replace("LAP ", "")}
              </div>
            </div>
          )}
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
